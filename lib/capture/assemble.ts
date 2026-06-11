/**
 * Streaming WAV assembly: download chunks one at a time and copy each into a
 * single preallocated output buffer, releasing the chunk immediately. Peak RAM
 * is ~one assembled call + one chunk, NOT the sum of every chunk plus a
 * concatenated copy — the difference between ~1.3 GB and ~0.7 GB for a 3-hour
 * call (HIGH perf finding; NFR-CALL-REL-1, FR-CALL-CAP-9).
 */
import "server-only";
import { downloadObject, type ChunkEntry } from "./storage";
import { parseWavHeader, buildWavHeader } from "./wav";

export async function assembleSessionAudio(
  chunks: ChunkEntry[],
  expect: { sampleRate: number; channels: number },
): Promise<
  | { ok: true; wav: Uint8Array; dataBytes: number }
  | { ok: false; error: string }
> {
  if (chunks.length === 0) return { ok: false, error: "no chunks" };

  // Upper bound: total object bytes (each chunk's PCM ≤ its full size). One
  // allocation; the canonical header overwrites the first 44 bytes at the end.
  const upperBound = chunks.reduce((n, c) => n + Math.max(c.size, 0), 0);
  // size metadata can be 0 if the listing didn't populate it — fall back to a
  // generous cap so we never under-allocate (4 MB max chunk × count).
  const cap = upperBound > 0 ? upperBound + 44 : chunks.length * 4 * 1024 * 1024 + 44;
  let out: Uint8Array;
  try {
    out = new Uint8Array(cap);
  } catch {
    return { ok: false, error: `Call too large to assemble (${cap} bytes)` };
  }

  let offset = 44; // leave room for the canonical header, written last
  for (const chunk of chunks) {
    const dl = await downloadObject(chunk.path);
    if (!dl.ok) return { ok: false, error: `Chunk download failed: ${dl.error}` };
    const info = parseWavHeader(dl.bytes);
    if (
      !info ||
      info.sampleRate !== expect.sampleRate ||
      info.channels !== expect.channels
    ) {
      return { ok: false, error: `Chunk format mismatch: ${chunk.path}` };
    }
    const data = dl.bytes.subarray(info.dataOffset, info.dataOffset + info.dataBytes);
    if (offset + data.length > out.length) {
      return { ok: false, error: "Assembled audio exceeded allocated buffer" };
    }
    out.set(data, offset);
    offset += data.length;
    // dl.bytes goes out of scope here — GC reclaims it before the next chunk.
  }

  const dataBytes = offset - 44;
  const header = buildWavHeader({
    sampleRate: expect.sampleRate,
    channels: expect.channels,
    dataBytes,
  });
  out.set(header, 0);
  return { ok: true, wav: out.subarray(0, offset), dataBytes };
}
