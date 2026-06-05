"use client";

import { useEffect, useRef, useState } from "react";
import { jarvisVoiceAudioSrc, type JarvisVoiceSlug } from "@/lib/jarvis-voice";

type JarvisVoiceCueProps = {
  slug: JarvisVoiceSlug;
  /** Increment this value to request playback. */
  playSignal: number;
  disabled?: boolean;
};

/**
 * Hidden ÑIGO audio player. Playback failures are intentionally silent:
 * browser autoplay policies should never block the UI path that triggered the
 * cue.
 */
export function JarvisVoiceCue({ slug, playSignal, disabled = false }: JarvisVoiceCueProps) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [available, setAvailable] = useState(true);
  const src = jarvisVoiceAudioSrc(slug);

  useEffect(() => {
    if (!playSignal || disabled || !available) return;
    const el = ref.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [available, disabled, playSignal, src]);

  if (!available) return null;

  return (
    <audio
      ref={ref}
      src={src}
      preload="auto"
      aria-hidden="true"
      onError={() => setAvailable(false)}
    />
  );
}
