"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { isAudioMuted, onAudioMuteChange, setAudioMuted } from "@/lib/audio-mute";

/** Global audio mute toggle — silences the login greeting, the quote-bubble
 *  voice, and demon-mode announcements. Persists across sessions. */
export function MuteButton() {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // rAF so the initial read lands in a callback, not synchronously in the effect.
    const raf = requestAnimationFrame(() => setMuted(isAudioMuted()));
    const off = onAudioMuteChange(setMuted);
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => setAudioMuted(!muted)}
      aria-pressed={muted}
      aria-label={muted ? "Unmute ÑIGO audio" : "Mute all ÑIGO audio"}
      title={muted ? "Audio muted — click to unmute" : "Mute all ÑIGO audio"}
      className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border transition hover:text-text-primary sm:inline-flex ${
        muted ? "border-[var(--red-text)] text-[var(--red-text)]" : "text-text-tertiary"
      }`}
      style={muted ? undefined : { borderColor: "var(--border-default)" }}
    >
      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
    </button>
  );
}
