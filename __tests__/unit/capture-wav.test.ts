import { describe, expect, it } from "vitest";
import {
  buildWavHeader,
  parseWavHeader,
  concatWavChunks,
  wavDurationSecs,
} from "@/lib/capture/wav";
import {
  CAPTURE_SAMPLE_RATE,
  CAPTURE_CHANNELS,
} from "@/lib/capture/constants";

/** A valid PCM16 stereo 16k chunk with `secs` seconds of silence. */
function makeChunk(secs: number, sampleRate = CAPTURE_SAMPLE_RATE): Uint8Array {
  const dataBytes = Math.round(secs * sampleRate) * CAPTURE_CHANNELS * 2;
  const header = buildWavHeader({
    sampleRate,
    channels: CAPTURE_CHANNELS,
    dataBytes,
  });
  const out = new Uint8Array(44 + dataBytes);
  out.set(header, 0);
  return out;
}

describe("wav codec", () => {
  it("builds a canonical 44-byte header that parses back", () => {
    const header = buildWavHeader({
      sampleRate: 16000,
      channels: 2,
      dataBytes: 1920000,
    });
    expect(header.length).toBe(44);
    // RIFF/WAVE/fmt /data magics
    expect(String.fromCharCode(...header.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...header.subarray(8, 12))).toBe("WAVE");

    const full = new Uint8Array(44 + 1920000);
    full.set(header, 0);
    const info = parseWavHeader(full);
    expect(info).not.toBeNull();
    expect(info!.sampleRate).toBe(16000);
    expect(info!.channels).toBe(2);
    expect(info!.bitsPerSample).toBe(16);
    expect(info!.dataOffset).toBe(44);
    expect(info!.dataBytes).toBe(1920000);
  });

  it("rejects non-WAV garbage and short buffers", () => {
    expect(parseWavHeader(new Uint8Array(10))).toBeNull();
    const junk = new Uint8Array(100).fill(0x41);
    expect(parseWavHeader(junk)).toBeNull();
  });

  it("rejects non-PCM (compressed) WAVs", () => {
    const header = buildWavHeader({ sampleRate: 16000, channels: 2, dataBytes: 100 });
    const full = new Uint8Array(144);
    full.set(header, 0);
    // audioFormat = 3 (IEEE float) instead of 1 (PCM)
    new DataView(full.buffer).setUint16(20, 3, true);
    expect(parseWavHeader(full)).toBeNull();
  });

  it("tolerates truncated data sections (trusts buffer length)", () => {
    const chunk = makeChunk(1);
    const truncated = chunk.subarray(0, chunk.length - 1000);
    const info = parseWavHeader(truncated);
    expect(info).not.toBeNull();
    expect(info!.dataBytes).toBe(truncated.length - 44);
  });

  it("concatenates chunks into one WAV whose duration is the sum", () => {
    const a = makeChunk(30);
    const b = makeChunk(30);
    const c = makeChunk(12.5);
    const out = concatWavChunks([a, b, c], {
      sampleRate: CAPTURE_SAMPLE_RATE,
      channels: CAPTURE_CHANNELS,
    });
    expect(out).not.toBeNull();
    const info = parseWavHeader(out!);
    expect(info).not.toBeNull();
    expect(wavDurationSecs(info!)).toBeCloseTo(72.5, 1);
  });

  it("preserves PCM byte order across assembly", () => {
    const a = makeChunk(0.001);
    const b = makeChunk(0.001);
    a[44] = 0xaa; // first PCM byte of chunk 0
    b[44] = 0xbb; // first PCM byte of chunk 1
    const out = concatWavChunks([a, b], {
      sampleRate: CAPTURE_SAMPLE_RATE,
      channels: CAPTURE_CHANNELS,
    })!;
    const aData = a.length - 44;
    expect(out[44]).toBe(0xaa);
    expect(out[44 + aData]).toBe(0xbb);
  });

  it("refuses to assemble mixed formats", () => {
    const good = makeChunk(1);
    const wrongRate = makeChunk(1, 44100);
    expect(
      concatWavChunks([good, wrongRate], {
        sampleRate: CAPTURE_SAMPLE_RATE,
        channels: CAPTURE_CHANNELS,
      }),
    ).toBeNull();
  });
});
