import { describe, expect, it } from "vitest";
import {
  JARVIS_VOICE_LINES,
  approvedJarvisVoiceLines,
  demonConnorMessage2AudioSrc,
  demonConnorSpeechAudioSrc,
  demonMessageAudioSrc,
  demonMessageLine,
  demonModeMessageClips,
  demonModeIntensity,
  demonTrumpMessageAudioSrc,
  jarvisVoiceAudioSrc,
  jarvisVoiceLine,
  pendingJarvisVoiceLines,
} from "@/lib/jarvis-voice";

describe("ÑIGO voice catalog", () => {
  it("has unique slugs", () => {
    const slugs = JARVIS_VOICE_LINES.map((line) => line.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps pending jokes out of the approved render set", () => {
    expect(pendingJarvisVoiceLines().length).toBeGreaterThan(0);
    expect(pendingJarvisVoiceLines().every((line) => line.category === "joke")).toBe(true);
    expect(approvedJarvisVoiceLines().every((line) => line.status === "approved")).toBe(true);
    expect(approvedJarvisVoiceLines().some((line) => line.category === "joke")).toBe(false);
  });

  it("exposes the notification line and its public audio path", () => {
    expect(jarvisVoiceLine("notification-unread-sir").text).toBe("You have got a notification, sir.");
    expect(jarvisVoiceAudioSrc("notification-unread-sir")).toBe("/jarvis/notification-unread-sir.mp3");
  });

  it("builds DEMON mode message assets from the greeting identity", () => {
    expect(demonMessageLine("Master Top G")).toBe("Sir Top G, I have a message.");
    expect(demonMessageLine("Sir Charles")).toBe("Sir Charles, I have a message.");
    expect(demonMessageAudioSrc("topg")).toBe("/jarvis/demon-message-topg.mp3");
    expect(demonTrumpMessageAudioSrc()).toBe("/jarvis/demon-trump-message.mp3");
    expect(demonConnorSpeechAudioSrc()).toBe("/jarvis/demon-connor-speech.mp3");
    expect(demonConnorMessage2AudioSrc()).toBe("/jarvis/demon-connor-message-2.mp3");
    expect(demonModeMessageClips().map((clip) => clip.slug)).toEqual([
      "trump-message",
      "connor-speech",
      "connor-message-2",
    ]);
  });

  it("falls back to normal intensity for unknown settings values", () => {
    expect(demonModeIntensity("high").value).toBe("high");
    expect(demonModeIntensity("whatever").value).toBe("normal");
  });
});
