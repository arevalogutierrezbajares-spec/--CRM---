import { describe, it, expect } from "vitest";
import {
  rebuildDialogue,
  resolveSpeakerLabel,
  extractDiarizationClusters,
  type DialogueUtterance,
} from "@/lib/capture/rebuild-dialogue";

const base: DialogueUtterance[] = [
  { speaker: "SPEAKER_00", diarizationId: "SPEAKER_00", channel: 0, start: 1, end: 2, text: "Hi" },
  { speaker: "SPEAKER_01", diarizationId: "SPEAKER_01", channel: 0, start: 3, end: 4, text: "Hello" },
  { speaker: "founder", channel: 0, start: 5, end: 6, text: "Mine" },
];

describe("rebuild-dialogue", () => {
  it("maps SPEAKER_xx via speakerMap", () => {
    const map = { SPEAKER_00: "Carlos", SPEAKER_01: "Ana" };
    expect(resolveSpeakerLabel(base[0], { founder: "You", participant: "P", speakerMap: map })).toBe(
      "Carlos",
    );
    const d = rebuildDialogue(base, { founder: "You", participant: "P", speakerMap: map });
    expect(d).toContain("[00:01] Carlos: Hi");
    expect(d).toContain("[00:03] Ana: Hello");
    expect(d).toContain("[00:05] You: Mine");
  });

  it("leaves unmapped SPEAKER ids as-is", () => {
    expect(
      resolveSpeakerLabel(base[0], { founder: "You", participant: "P", speakerMap: {} }),
    ).toBe("SPEAKER_00");
  });

  it("extracts unique clusters", () => {
    expect(extractDiarizationClusters(base)).toEqual(["SPEAKER_00", "SPEAKER_01"]);
  });
});
