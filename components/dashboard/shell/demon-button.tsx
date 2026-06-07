"use client";

import { useRef } from "react";
import { Flame } from "lucide-react"; // PLACEHOLDER ICON — swap for the uploaded icon later
import { DEMON_BROADCAST_MESSAGES } from "@/lib/quotes";
import { readDisabledBroadcasts } from "@/lib/quote-prefs";

/**
 * Top-bar button (next to the mute toggle) that plays a random demon-mode
 * broadcast soundbite on press. Deliberate action → plays even when muted.
 *
 * To swap the icon: replace the <Flame> below with the uploaded asset, e.g.
 *   <img src="/icons/demon.svg" alt="" className="h-[15px] w-[15px]" />
 */
export function DemonButton() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function play() {
    const disabled = readDisabledBroadcasts();
    const withClips = DEMON_BROADCAST_MESSAGES.filter((b) => b.audioSrc);
    const pool = withClips.filter((b) => !disabled.has(b.audioSrc ?? ""));
    const list = pool.length > 0 ? pool : withClips; // ignore in-loop filter only if it empties the list
    if (list.length === 0) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    const audio = audioRef.current;
    if (!audio || !pick.audioSrc) return;
    audio.pause();
    audio.currentTime = 0;
    audio.src = pick.audioSrc;
    void audio.play().catch(() => {});
  }

  return (
    <>
      <audio ref={audioRef} preload="none" />
      <button
        type="button"
        onClick={play}
        aria-label="Play a demon-mode message"
        title="Demon-mode message"
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full border text-text-tertiary transition hover:text-[var(--red-text)] sm:inline-flex"
        style={{ borderColor: "var(--border-default)" }}
      >
        <Flame size={15} />
      </button>
    </>
  );
}
