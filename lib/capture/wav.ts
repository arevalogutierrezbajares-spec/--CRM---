/**
 * Minimal PCM16 WAV tooling for the capture pipeline. Chunks arrive as
 * standalone canonical WAVs (44-byte header + PCM data); assembly is
 * header-strip + byte-concat + fresh header (protocol §Audio format).
 * Pure functions — unit-tested without I/O.
 */

export type WavInfo = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataBytes: number;
};

function readAscii(buf: Uint8Array, off: number, len: number): string {
  return String.fromCharCode(...buf.subarray(off, off + len));
}

/**
 * Parse a WAV header. Tolerates extra chunks before `data` (some encoders add
 * LIST/fact), but requires PCM16. Returns null when the buffer isn't a usable
 * WAV — callers reject the upload (better a loud 400 than a corrupt call).
 */
export function parseWavHeader(buf: Uint8Array): WavInfo | null {
  if (buf.length < 44) return null;
  if (readAscii(buf, 0, 4) !== "RIFF" || readAscii(buf, 8, 4) !== "WAVE") {
    return null;
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12;
  let fmt: { sampleRate: number; channels: number; bits: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = readAscii(buf, off, 4);
    const size = view.getUint32(off + 4, true);
    if (id === "fmt ") {
      if (off + 8 + 16 > buf.length) return null;
      const audioFormat = view.getUint16(off + 8, true);
      if (audioFormat !== 1) return null; // PCM only
      fmt = {
        channels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        bits: view.getUint16(off + 22, true),
      };
    } else if (id === "data") {
      if (!fmt || fmt.bits !== 16) return null;
      const dataOffset = off + 8;
      // Trust actual buffer length over the declared size when truncated.
      const dataBytes = Math.min(size, buf.length - dataOffset);
      return {
        sampleRate: fmt.sampleRate,
        channels: fmt.channels,
        bitsPerSample: fmt.bits,
        dataOffset,
        dataBytes,
      };
    }
    off += 8 + size + (size % 2); // chunks are word-aligned
  }
  return null;
}

/** Canonical 44-byte PCM16 WAV header. */
export function buildWavHeader(opts: {
  sampleRate: number;
  channels: number;
  dataBytes: number;
}): Uint8Array {
  const { sampleRate, channels, dataBytes } = opts;
  const blockAlign = channels * 2;
  const byteRate = sampleRate * blockAlign;
  const buf = new Uint8Array(44);
  const view = new DataView(buf.buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return buf;
}

/**
 * Concatenate chunk WAVs (in seq order) into one WAV. Validates each chunk's
 * format matches the expected rate/channels; returns null on any mismatch
 * (a mixed-format call is unrecoverable garbage — fail loudly).
 */
export function concatWavChunks(
  chunks: Uint8Array[],
  expect: { sampleRate: number; channels: number },
): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const chunk of chunks) {
    const info = parseWavHeader(chunk);
    if (
      !info ||
      info.sampleRate !== expect.sampleRate ||
      info.channels !== expect.channels
    ) {
      return null;
    }
    const data = chunk.subarray(info.dataOffset, info.dataOffset + info.dataBytes);
    parts.push(data);
    total += data.length;
  }
  const header = buildWavHeader({
    sampleRate: expect.sampleRate,
    channels: expect.channels,
    dataBytes: total,
  });
  const out = new Uint8Array(44 + total);
  out.set(header, 0);
  let off = 44;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Duration in seconds of a PCM16 WAV. */
export function wavDurationSecs(info: WavInfo): number {
  const blockAlign = info.channels * 2;
  return info.dataBytes / blockAlign / info.sampleRate;
}
