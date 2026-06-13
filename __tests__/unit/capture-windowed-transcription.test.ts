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
  it("splits chunks into windows bounded by TRANSCRIBE_WINDOW_BYTES (32 MB)", async () => {
    // 40 chunks × 2 MB = 80 MB → 3 windows of ≤ 32 MB (16 + 16 + 8).
    const chunks = Array.from({ length: 40 }, () => chunk(2 * 1024 * 1024));

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

    // 3 windows → 3 assemble calls, 3 deepgram calls.
    expect(assembleMock).toHaveBeenCalledTimes(3);
    expect(transcribeBytesMock).toHaveBeenCalledTimes(3);

    // First assemble window got 16 chunks (16×2 MB = 32 MB exactly).
    expect((assembleMock.mock.calls[0][0] as ChunkEntry[]).length).toBe(16);
  });

  it("offsets utterance timestamps by cumulative window duration", async () => {
    const chunks = Array.from({ length: 32 }, () => chunk(2 * 1024 * 1024)); // 2 windows
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

  it("keeps zero-size-listing chunks bounded by count (nominal 2 MB each)", async () => {
    // 20 chunks reported as size 0 → nominal 2 MB → 1 window holds 16, then 4.
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
    expect(assembleMock).toHaveBeenCalledTimes(2); // 16 + 4
  });
});
