import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChunkEntry } from "@/lib/capture/storage";

// Mock the two collaborators transcribeWindowed calls directly. buildDialogue
// and detectSilentChannels are kept REAL (pure helpers) so the stitched
// timestamps and whole-call silence detection are exercised for real.
const assembleMock = vi.fn();
const transcribeBytesMock = vi.fn();

vi.mock("@/lib/capture/assemble", () => ({
  assembleSessionAudio: (...args: unknown[]) => assembleMock(...args),
}));
vi.mock("@/lib/capture/deepgram", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/capture/deepgram")>();
  return {
    ...actual,
    transcribeDualChannelBytes: (...args: unknown[]) =>
      transcribeBytesMock(...args),
  };
});

import { transcribeWindowed } from "@/lib/capture/finalize";

const FMT = { sampleRate: 16000, channels: 2 };
const BYTES_PER_SEC = FMT.channels * 2 * FMT.sampleRate; // 64000

function chunk(size: number): ChunkEntry {
  return { path: `p/${size}`, size };
}

beforeEach(() => {
  assembleMock.mockReset();
  transcribeBytesMock.mockReset();
});

describe("[unit] transcribeWindowed — memory-bounded long-call transcription", () => {
  it("splits chunks into windows bounded by TRANSCRIBE_WINDOW_BYTES (8 MB)", async () => {
    // 20 chunks × 2 MB = 40 MB → 5 windows of ≤ 8 MB (4 + 4 + 4 + 4 + 4).
    const chunks = Array.from({ length: 20 }, () => chunk(2 * 1024 * 1024));

    // Each window assembles to a WAV whose PCM = 60 s of audio (arbitrary,
    // constant so offset math is easy to assert).
    const oneMinPcm = 60 * BYTES_PER_SEC;
    assembleMock.mockResolvedValue({
      ok: true,
      wav: new Uint8Array(oneMinPcm + 44),
      dataBytes: oneMinPcm,
    });
    transcribeBytesMock.mockResolvedValue({
      ok: true,
      result: {
        utterances: [
          { speaker: "founder", channel: 0, start: 1, end: 2, text: "hi" },
        ],
        dialogueText: "",
        language: "multi",
        suspectFlags: [],
      },
    });

    const out = await transcribeWindowed(chunks, FMT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // 5 windows → 5 assemble calls, 5 deepgram calls.
    expect(assembleMock).toHaveBeenCalledTimes(5);
    expect(transcribeBytesMock).toHaveBeenCalledTimes(5);

    // First assemble window got 4 chunks (4×2 MB = 8 MB exactly).
    expect((assembleMock.mock.calls[0][0] as ChunkEntry[]).length).toBe(4);
  });

  it("offsets utterance timestamps by cumulative window duration", async () => {
    // 8 chunks × 2 MB = 16 MB → 2 windows of 4 chunks under the 8 MB cap.
    const chunks = Array.from({ length: 8 }, () => chunk(2 * 1024 * 1024));
    const oneMinPcm = 60 * BYTES_PER_SEC;
    assembleMock.mockResolvedValue({
      ok: true,
      wav: new Uint8Array(oneMinPcm + 44),
      dataBytes: oneMinPcm,
    });
    // Each window reports an utterance at local t=5s.
    transcribeBytesMock.mockResolvedValue({
      ok: true,
      result: {
        utterances: [
          { speaker: "founder", channel: 0, start: 5, end: 6, text: "x" },
        ],
        dialogueText: "",
        language: "en",
        suspectFlags: [],
      },
    });

    const out = await transcribeWindowed(chunks, FMT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // Window 0 utterance stays at 5s; window 1 (offset +60s) lands at 65s.
    const starts = out.result.utterances.map((u) => u.start).sort((a, b) => a - b);
    expect(starts).toEqual([5, 65]);
    // Total duration = 2 windows × 60s.
    expect(out.durationSecs).toBe(120);
    expect(out.result.language).toBe("en");
  });

  it("propagates a window transcription failure as a 502", async () => {
    const chunks = Array.from({ length: 16 }, () => chunk(2 * 1024 * 1024));
    assembleMock.mockResolvedValue({
      ok: true,
      wav: new Uint8Array(44),
      dataBytes: 0,
    });
    transcribeBytesMock.mockResolvedValue({ ok: false, error: "Deepgram 500" });

    const out = await transcribeWindowed(chunks, FMT);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.status).toBe(502);
  });

  it("encodes a playback MP3 when encodeMp3 is set, and null otherwise", async () => {
    const chunks = Array.from({ length: 8 }, () => chunk(2 * 1024 * 1024));
    // Real (silent) stereo PCM so the real MP3 encoder has something to chew on.
    const oneSecPcm = new Uint8Array(BYTES_PER_SEC + 44);
    assembleMock.mockResolvedValue({
      ok: true,
      wav: oneSecPcm,
      dataBytes: BYTES_PER_SEC,
    });
    transcribeBytesMock.mockResolvedValue({
      ok: true,
      result: { utterances: [], dialogueText: "", language: "multi", suspectFlags: [] },
    });

    const withMp3 = await transcribeWindowed(chunks, FMT, { encodeMp3: true });
    expect(withMp3.ok).toBe(true);
    if (!withMp3.ok) return;
    expect(withMp3.mp3).not.toBeNull();
    expect(withMp3.mp3!.length).toBeGreaterThan(0);
    expect(withMp3.mp3![0]).toBe(0xff); // MP3 frame sync

    const withoutMp3 = await transcribeWindowed(chunks, FMT);
    expect(withoutMp3.ok).toBe(true);
    if (!withoutMp3.ok) return;
    expect(withoutMp3.mp3).toBeNull();
  });

  it("keeps zero-size-listing chunks bounded by count (nominal 2 MB each)", async () => {
    // 20 chunks reported as size 0 → nominal 2 MB → 5 windows of 4 under the 8 MB cap.
    const chunks = Array.from({ length: 20 }, () => chunk(0));
    assembleMock.mockResolvedValue({
      ok: true,
      wav: new Uint8Array(44),
      dataBytes: BYTES_PER_SEC,
    });
    transcribeBytesMock.mockResolvedValue({
      ok: true,
      result: { utterances: [], dialogueText: "", language: "multi", suspectFlags: [] },
    });

    const out = await transcribeWindowed(chunks, FMT);
    expect(out.ok).toBe(true);
    expect(assembleMock).toHaveBeenCalledTimes(5); // 4+4+4+4+4
  });
});
