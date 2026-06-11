"use client";

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Ambient background video for the room hero — VAV-landing style: muted,
 * looping, object-cover, with a darkening gradient so white text stays
 * AA-legible. Respects prefers-reduced-motion by swapping to the poster frame.
 */
export function RoomHeroVideo({
  mp4,
  webm,
  poster,
}: {
  mp4: string;
  webm: string;
  poster: string;
}) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 bg-black">
      {/* Poster paints instantly for reduced-motion users via CSS (no
          hydration flash); once hydrated, JS also unmounts the video so it
          stops downloading/playing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={poster}
        alt=""
        className={`h-full w-full object-cover ${
          reduceMotion ? "" : "hidden motion-reduce:block"
        }`}
      />
      {!reduceMotion && (
        <video
          className="h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          poster={poster}
          preload="metadata"
        >
          <source src={webm} type="video/webm" />
          <source src={mp4} type="video/mp4" />
        </video>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-black/75" />
    </div>
  );
}
