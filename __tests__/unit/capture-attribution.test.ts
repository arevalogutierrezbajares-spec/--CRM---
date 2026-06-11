import { describe, expect, it } from "vitest";
import {
  buildDialogue,
  detectSilentChannels,
  type Utterance,
} from "@/lib/capture/deepgram";
import {
  FLAG_FOUNDER_SILENT,
  FLAG_PARTICIPANT_SILENT,
} from "@/lib/capture/constants";

function u(channel: number, start: number, end: number, text: string): Utterance {
  return {
    speaker: channel === 0 ? "founder" : "participant",
    channel,
    start,
    end,
    text,
  };
}

describe("dialogue building (FR-CALL-ATT-1/2)", () => {
  it("labels each utterance by channel with mm:ss timestamps", () => {
    const dialogue = buildDialogue(
      [u(0, 0, 3, "Hola Carlos, ¿cómo estás?"), u(1, 4, 9, "Bien Tomás, ¿y tú?")],
      { founder: "Tomas", participant: "Carlos" },
    );
    expect(dialogue).toBe(
      "[00:00] Tomas: Hola Carlos, ¿cómo estás?\n[00:04] Carlos: Bien Tomás, ¿y tú?",
    );
  });

  it("formats minute-plus timestamps", () => {
    const dialogue = buildDialogue([u(1, 75.4, 80, "ok")], {
      founder: "F",
      participant: "P",
    });
    expect(dialogue).toBe("[01:15] P: ok");
  });
});

describe("silent-channel detection (FR-CALL-OPS-4)", () => {
  it("flags a silent founder channel when participants spoke", () => {
    const utts = [u(1, 0, 30, "a"), u(1, 35, 60, "b"), u(1, 65, 100, "c")];
    expect(detectSilentChannels(utts, 120)).toEqual([FLAG_FOUNDER_SILENT]);
  });

  it("flags a silent participant channel", () => {
    const utts = [u(0, 0, 30, "a"), u(0, 35, 60, "b"), u(0, 65, 100, "c")];
    expect(detectSilentChannels(utts, 120)).toEqual([FLAG_PARTICIPANT_SILENT]);
  });

  it("does not flag a balanced call", () => {
    const utts = [
      u(0, 0, 30, "a"),
      u(1, 31, 60, "b"),
      u(0, 61, 90, "c"),
      u(1, 91, 120, "d"),
    ];
    expect(detectSilentChannels(utts, 120)).toEqual([]);
  });

  it("stays quiet on very short calls (not enough signal)", () => {
    expect(detectSilentChannels([u(0, 0, 5, "hi")], 10)).toEqual([]);
  });

  it("flags both channels of a no-speech call long enough to matter", () => {
    const flags = detectSilentChannels([], 60);
    expect(flags).toContain(FLAG_FOUNDER_SILENT);
    expect(flags).toContain(FLAG_PARTICIPANT_SILENT);
  });
});
