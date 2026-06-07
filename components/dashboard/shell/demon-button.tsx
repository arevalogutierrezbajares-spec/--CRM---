"use client";

import { useRef } from "react";
import { DEMON_BROADCAST_MESSAGES } from "@/lib/quotes";
import { readDisabledBroadcasts } from "@/lib/quote-prefs";

/**
 * Top-bar button (next to the mute toggle) that plays a random demon-mode
 * broadcast soundbite on press. Deliberate action → plays even when muted.
 * Icon: the jaguar (public/icons/jaguar-stalking.svg).
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
        className="hidden h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border opacity-90 transition hover:scale-110 hover:opacity-100 sm:inline-flex"
        style={{ borderColor: "var(--border-default)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/jaguar-stalking.svg" alt="" className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}
