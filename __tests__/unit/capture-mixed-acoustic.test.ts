import { describe, it, expect, afterEach, vi } from "vitest";
import {
  isInPersonMeetingSource,
  isSpeakerphoneSource,
  isMixedAcousticSource,
  SOURCE_APP_IN_PERSON_MEETING,
  SOURCE_APP_SPEAKERPHONE,
  FLAG_PARTICIPANT_SILENT,
  FLAG_FOUNDER_SILENT,
} from "@/lib/capture/constants";
import { detectSilentChannels } from "@/lib/capture/deepgram";

/**
 * Speakerphone captures are acoustically identical to in-person meetings: every
 * speaker reaches the mic through air and lands on ch0, so channel identity
 * carries no speaker information. Before this, speakerphone sessions took the
 * channel-based path and every participant collapsed into one "founder" label.
 */
describe("mixed-acoustic capture sources", () => {
  it("treats speakerphone and in-person as mixed acoustic", () => {
    expect(isMixedAcousticSource(SOURCE_APP_SPEAKERPHONE)).toBe(true);
    expect(isMixedAcousticSource(SOURCE_APP_IN_PERSON_MEETING)).toBe(true);
  });

  it("does not treat a normal on-Mac call as mixed acoustic", () => {
    expect(isMixedAcousticSource("WhatsApp")).toBe(false);
    expect(isMixedAcousticSource(null)).toBe(false);
    expect(isMixedAcousticSource(undefined)).toBe(false);
    expect(isMixedAcousticSource("")).toBe(false);
  });

  it("keeps speakerphone distinct from a meeting for wording purposes", () => {
    // A speakerphone session is still a "Call", not a "Meeting" — the title and
    // brief wording key off isInPersonMeetingSource, which must stay narrow.
    expect(isInPersonMeetingSource(SOURCE_APP_SPEAKERPHONE)).toBe(false);
    expect(isSpeakerphoneSource(SOURCE_APP_SPEAKERPHONE)).toBe(true);
    expect(isSpeakerphoneSource(SOURCE_APP_IN_PERSON_MEETING)).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isMixedAcousticSource("  Speakerphone  ")).toBe(true);
  });
});

describe("silent-channel flags for mixed-acoustic captures", () => {
  const u = (channel: number, start: number, end: number) => ({
    speaker: channel === 0 ? "founder" : "participant",
    channel,
    start,
    end,
    text: "hello there",
  });

  // All speech on ch0, R silent by design.
  const monoUtterances = [u(0, 0, 20), u(0, 21, 40), u(0, 41, 60)];

  it("does not flag the silent R channel when the capture is mixed acoustic", () => {
    const flags = detectSilentChannels(monoUtterances, 120, { mixedAcoustic: true });
    expect(flags).not.toContain(FLAG_PARTICIPANT_SILENT);
  });

  it("still flags the silent R channel for a normal two-channel call", () => {
    const flags = detectSilentChannels(monoUtterances, 120);
    expect(flags).toContain(FLAG_PARTICIPANT_SILENT);
  });

  it("still flags a genuinely silent mic even when mixed acoustic", () => {
    // Nothing on ch0 at all — that is a real problem in any mode.
    const flags = detectSilentChannels([u(1, 0, 30), u(1, 31, 60), u(1, 61, 90)], 120, {
      mixedAcoustic: true,
    });
    expect(flags).toContain(FLAG_FOUNDER_SILENT);
  });
});

/**
 * Regression for the "everyone collapses into SPEAKER_00" bug on multi-person
 * speakerphone calls. Deepgram's utterance segmenter merges rapid turns into one
 * utterance with a single speaker, but its *word-level* diarization keeps them
 * apart. parseDeepgram (via the public transcribe fn) must rebuild turns from
 * words when diarizing so distinct voices survive as SPEAKER_00 / SPEAKER_01.
 */
describe("word-level diarization recovery", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("recovers 2 speakers when utterances collapse but words carry both", async () => {
    vi.stubEnv("DEEPGRAM_API_KEY", "test-key");
    const w = (word: string, start: number, end: number, speaker: number) => ({
      word,
      punctuated_word: word,
      start,
      end,
      speaker,
    });
    const fixture = {
      results: {
        // Collapsed: one utterance, one speaker — what the old code read.
        utterances: [
          {
            speaker: 1,
            channel: 0,
            start: 0,
            end: 3,
            transcript: "Hello there. Hi how are you? Doing well thanks.",
          },
        ],
        // Word level: diarization actually split speaker 0 and 1.
        channels: [
          {
            detected_language: "en",
            alternatives: [
              {
                words: [
                  w("Hello", 0.0, 0.4, 0),
                  w("there.", 0.4, 0.9, 0),
                  w("Hi", 1.1, 1.3, 1),
                  w("how", 1.3, 1.5, 1),
                  w("are", 1.5, 1.7, 1),
                  w("you?", 1.7, 2.0, 1),
                  w("Doing", 2.2, 2.5, 0),
                  w("well", 2.5, 2.8, 0),
                  w("thanks.", 2.8, 3.0, 0),
                ],
              },
            ],
          },
        ],
      },
    };
    globalThis.fetch = (async () =>
      ({ ok: true, json: async () => fixture }) as Response) as typeof fetch;

    const { transcribeDualChannelBytes } = await import("@/lib/capture/deepgram");
    const res = await transcribeDualChannelBytes({
      wav: new Uint8Array([1, 2, 3]),
      durationSecs: 3,
      mixedAcoustic: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ids = [...new Set(res.result.utterances.map((u) => u.diarizationId))];
    expect(ids).toEqual(["SPEAKER_00", "SPEAKER_01"]);
    // 3 alternating turns, not 1 collapsed block.
    expect(res.result.utterances.length).toBe(3);
    expect(res.result.utterances[0].speaker).toBe("SPEAKER_00");
    expect(res.result.utterances[1].speaker).toBe("SPEAKER_01");
  });
});
