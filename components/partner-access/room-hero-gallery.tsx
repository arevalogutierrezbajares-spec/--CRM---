"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CROSSFADE_INTERVAL_MS = 9000;

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Photo background for the room hero — the still-image sibling of
 * RoomHeroVideo. One image gets a slow Ken Burns drift; several crossfade
 * on a timer, each drifting in alternating directions, under the same
 * darkening gradient that keeps white hero text AA-legible. Reduced motion
 * pins the first image, static.
 */
export function RoomHeroGallery({ images }: { images: string[] }) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
  const [active, setActive] = useState(0);

  const cycling = !reduceMotion && images.length > 1;
  useEffect(() => {
    if (!cycling) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % images.length),
      CROSSFADE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [cycling, images.length]);

  if (images.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
    >
      {(reduceMotion ? images.slice(0, 1) : images).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full object-cover will-change-transform ${
            i % 2 === 0
              ? "animate-[hero-kenburns-a_24s_ease-in-out_infinite_alternate]"
              : "animate-[hero-kenburns-b_24s_ease-in-out_infinite_alternate]"
          } motion-reduce:animate-none ${
            images.length > 1
              ? `transition-opacity duration-[1500ms] ease-in-out ${
                  i === active ? "opacity-100" : "opacity-0"
                }`
              : ""
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/45 to-black/75" />
    </div>
  );
}
