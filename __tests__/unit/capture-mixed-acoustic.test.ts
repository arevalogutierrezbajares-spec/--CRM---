import { describe, it, expect } from "vitest";
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
