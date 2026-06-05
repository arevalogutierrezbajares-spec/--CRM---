"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GreetingSlug } from "@/lib/greeting";
import {
  DEMON_MODE_ENABLED_KEY,
  DEMON_MODE_INTENSITY_KEY,
  DEMON_MODE_SETTINGS_EVENT,
  DEMON_MODE_TEST_EVENT,
  demonMessageAudioSrc,
  demonModeMessageClips,
  demonModeIntensity,
  type DemonModeIntensity,
} from "@/lib/jarvis-voice";

type DemonModeControllerProps = {
  identitySlug: GreetingSlug;
};

type DemonSettings = {
  enabled: boolean;
  intensity: DemonModeIntensity;
};

const MIN_ACTIVITY_BEFORE_ROLL = 4;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel"] as const;
const MESSAGE_CLIPS = demonModeMessageClips();

function readSettings(): DemonSettings {
  try {
    return {
      enabled: localStorage.getItem(DEMON_MODE_ENABLED_KEY) === "1",
      intensity: demonModeIntensity(localStorage.getItem(DEMON_MODE_INTENSITY_KEY)).value,
    };
  } catch {
    return { enabled: false, intensity: "normal" };
  }
}

function playAudio(el: HTMLAudioElement | null): Promise<void> {
  if (!el) return Promise.resolve();
  el.currentTime = 0;
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener("ended", done);
      el.removeEventListener("error", done);
      resolve();
    };
    el.addEventListener("ended", done);
    el.addEventListener("error", done);
    void el.play().catch(done);
  });
}

function randomMessageSrc(): string {
  const index = Math.floor(Math.random() * MESSAGE_CLIPS.length);
  return MESSAGE_CLIPS[index]?.src ?? MESSAGE_CLIPS[0]!.src;
}

export function DemonModeController({ identitySlug }: DemonModeControllerProps) {
  const [settings, setSettings] = useState<DemonSettings>({ enabled: false, intensity: "normal" });
  const introRef = useRef<HTMLAudioElement | null>(null);
  const messageRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const activityCountRef = useRef(0);
  const nextEligibleAtRef = useRef(0);

  useEffect(() => {
    const hydrate = () => setSettings(readSettings());
    const raf = requestAnimationFrame(hydrate);
    window.addEventListener(DEMON_MODE_SETTINGS_EVENT, hydrate);
    window.addEventListener("storage", hydrate);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(DEMON_MODE_SETTINGS_EVENT, hydrate);
      window.removeEventListener("storage", hydrate);
    };
  }, []);

  const playDemonMessage = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    try {
      await playAudio(introRef.current);
      if (messageRef.current) messageRef.current.src = randomMessageSrc();
      await playAudio(messageRef.current);
    } finally {
      playingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onTest = () => {
      nextEligibleAtRef.current = Date.now() + 2_000;
      void playDemonMessage();
    };
    window.addEventListener(DEMON_MODE_TEST_EVENT, onTest);
    return () => window.removeEventListener(DEMON_MODE_TEST_EVENT, onTest);
  }, [playDemonMessage]);

  useEffect(() => {
    const onActivity = () => {
      if (!settings.enabled || document.hidden || playingRef.current) return;

      const config = demonModeIntensity(settings.intensity);
      const now = Date.now();
      if (now < nextEligibleAtRef.current) return;

      activityCountRef.current += 1;
      if (activityCountRef.current < MIN_ACTIVITY_BEFORE_ROLL) return;

      if (Math.random() > config.chance) return;

      activityCountRef.current = 0;
      nextEligibleAtRef.current = now + config.cooldownMs;
      void playDemonMessage();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
    };
  }, [playDemonMessage, settings.enabled, settings.intensity]);

  return (
    <>
      <audio
        ref={introRef}
        src={demonMessageAudioSrc(identitySlug)}
        preload="auto"
        aria-hidden="true"
      />
      <audio
        ref={messageRef}
        src={MESSAGE_CLIPS[0]?.src}
        preload="metadata"
        aria-hidden="true"
      />
    </>
  );
}
