import { describe, expect, it } from "vitest";
import { Mp3StreamEncoder, estimatedMp3Bytes, MP3_BITRATE_KBPS } from "@/lib/capture/mp3";

const SR = 16000;
const CH = 2;

/** Build an interleaved stereo PCM16 buffer of `secs` seconds of a tone. */
function stereoPcm(secs: number): Uint8Array {
  const frames = secs * SR;
  const view = new Int16Array(frames * CH);
  for (let i = 0; i < frames; i++) {
    const s = (Math.sin(i * 0.02) * 8000) | 0;
    view[i * 2] = s;
    view[i * 2 + 1] = s;
  }
  return new Uint8Array(view.buffer);
}

describe("[unit] Mp3StreamEncoder — compact long-call playback", () => {
  it("encodes stereo PCM windows into a valid MP3 stream", () => {
    const enc = new Mp3StreamEncoder(SR);
    enc.addStereoPcm(stereoPcm(2));
    enc.addStereoPcm(stereoPcm(2));
    const mp3 = enc.finish();

    expect(mp3.length).toBeGreaterThan(0);
    // MP3 frames begin with the 11-bit frame sync: first byte 0xFF, second
    // byte's top 3 bits set (0xE0). lamejs emits raw frames (no ID3 header).
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
  });

  it("is far smaller than the raw PCM it came from", () => {
    const pcm = stereoPcm(10); // 10 s stereo PCM = 10 * 16000 * 2 * 2 = 640 KB
    const enc = new Mp3StreamEncoder(SR);
    enc.addStereoPcm(pcm);
    const mp3 = enc.finish();
    // 10 s @ 32 kbps ≈ 40 KB — at least 5× smaller than the 640 KB source.
    expect(mp3.length).toBeLessThan(pcm.length / 5);
  });

  it("tolerates an odd-byte-offset source buffer (alignment copy path)", () => {
    const base = stereoPcm(1);
    const padded = new Uint8Array(base.length + 1);
    padded.set(base, 1);
    const odd = padded.subarray(1); // byteOffset 1 (odd)
    const enc = new Mp3StreamEncoder(SR);
    expect(() => enc.addStereoPcm(odd)).not.toThrow();
    expect(enc.finish().length).toBeGreaterThan(0);
  });

  it("estimatedMp3Bytes scales with duration at the configured bitrate", () => {
    const oneHour = estimatedMp3Bytes(3600);
    expect(oneHour).toBe(Math.ceil((MP3_BITRATE_KBPS * 1000) / 8) * 3600);
    // 50 MB budget covers well over 3 hours at 32 kbps.
    expect(estimatedMp3Bytes(3 * 3600)).toBeLessThan(45 * 1024 * 1024);
    expect(estimatedMp3Bytes(0)).toBe(0);
  });
});
