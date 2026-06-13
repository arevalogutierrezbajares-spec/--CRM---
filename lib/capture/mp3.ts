/**
 * Streaming MP3 encoder for call playback (FR-CALL-ACC-3, long-call playback).
 *
 * Long calls are never assembled into one buffer (that OOM'd finalize), and a
 * raw WAV is too big to store anyway (a 77-min call is ~295 MB, over Supabase's
 * ~50 MB object limit). So we encode a compact mono MP3 incrementally — fed one
 * transcription window at a time — which is ~18 MB for 77 min and plays through
 * the existing signed-URL audio route unchanged. Peak RAM is one window of PCM
 * plus the (small) growing MP3 output, never the whole call.
 *
 * Mono @ 32 kbps: speech-intelligible, and 50 MB ≈ 3.5 h, so virtually any real
 * call fits. Dual-channel attribution lives in the transcript; playback is mono.
 */
import "server-only";
import lamejs from "@breezystack/lamejs";
import { CAPTURE_SAMPLE_RATE } from "./constants";

// The package's ESM build (what Next/vitest load) exposes Mp3Encoder on the
// default export; guard against an extra interop wrapper just in case.
const Mp3Encoder =
  (lamejs as unknown as { Mp3Encoder?: typeof lamejs.Mp3Encoder }).Mp3Encoder ??
  (lamejs as unknown as { default?: { Mp3Encoder: typeof lamejs.Mp3Encoder } }).default
    ?.Mp3Encoder;

if (!Mp3Encoder) {
  throw new Error(
    "@breezystack/lamejs: Mp3Encoder not found on the module export (interop shape changed?)",
  );
}

/** Playback MP3 bitrate (kbps, mono). 32 kbps ≈ 4 KB/s → 50 MB ≈ 3.5 h. */
export const MP3_BITRATE_KBPS = 32;

/** Estimated MP3 size for a given duration — used to skip encoding calls so
 *  long the MP3 still wouldn't fit (graceful: transcript retained, no audio). */
export function estimatedMp3Bytes(durationSecs: number): number {
  return Math.ceil((MP3_BITRATE_KBPS * 1000) / 8) * Math.max(0, durationSecs);
}

export class Mp3StreamEncoder {
  private readonly enc: InstanceType<typeof lamejs.Mp3Encoder>;
  private readonly parts: Uint8Array[] = [];
  private total = 0;

  constructor(sampleRate: number = CAPTURE_SAMPLE_RATE) {
    // Non-null: the module-level guard above throws if Mp3Encoder is undefined.
    this.enc = new Mp3Encoder!(1, sampleRate, MP3_BITRATE_KBPS);
  }

  /**
   * Feed one interleaved stereo PCM16 window (no WAV header) and downmix to
   * mono on the fly. Safe regardless of the source buffer's byte alignment.
   */
  addStereoPcm(pcm: Uint8Array): void {
    const view =
      pcm.byteOffset % 2 === 0
        ? new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1)
        : new Int16Array(pcm.slice().buffer); // odd offset → align via copy
    const frames = view.length >> 1;
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      // average L+R so neither side is lost in mono playback
      mono[i] = (view[i * 2] + view[i * 2 + 1]) >> 1;
    }
    const out = this.enc.encodeBuffer(mono);
    if (out.length) {
      this.parts.push(out);
      this.total += out.length;
    }
  }

  /** Flush the encoder and return the complete MP3. */
  finish(): Uint8Array {
    const tail = this.enc.flush();
    if (tail.length) {
      this.parts.push(tail);
      this.total += tail.length;
    }
    const result = new Uint8Array(this.total);
    let offset = 0;
    for (const part of this.parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
}
