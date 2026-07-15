"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { RoomHeroPhoto } from "@/lib/partner-room-photos";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const CROSSFADE_INTERVAL_MS = 11000;

/** The hero spans the viewport up to the page's max-w-6xl content column. */
const HERO_SIZES = "(max-width: 1152px) 100vw, 1104px";

/** Tiled fractal-noise film grain (SVG feTurbulence), inlined so it costs no
 *  request. Rendered oversized and jittered in steps like real film stock. */
const GRAIN_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">' +
      '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>' +
      '<feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0"/></filter>' +
      '<rect width="240" height="240" filter="url(#n)"/></svg>',
  );

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * "Living archive" hero background for vintage expedition photography —
 * the photos read as projected film, not static scans:
 *
 *   · silver-gelatin grade (warm sepia, lifted contrast) on the images
 *   · slow Ken Burns drift, alternating direction per slide
 *   · long crossfades between photos (paused while the tab is hidden)
 *   · animated film grain (feTurbulence tile jittered in steps)
 *   · vignette + occasional soft light-leak sweep
 *   · optional provenance caption in the corner
 *   · the usual darkening gradient so white hero text stays AA-legible
 *
 * Photos carry srcSet (phones fetch the 800w variant) and a focal point so
 * the subject survives both the wide desktop crop and the squarer mobile
 * crop. Reduced motion pins the first image with the grade + vignette only.
 */
export function RoomHeroArchive({
  images,
  caption,
}: {
  images: RoomHeroPhoto[];
  caption?: string;
}) {
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionSnapshot,
    () => false,
  );
  const [active, setActive] = useState(0);

  const cycling = !reduceMotion && images.length > 1;
  useEffect(() => {
    if (!cycling) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id) return;
      id = setInterval(
        () => setActive((i) => (i + 1) % images.length),
        CROSSFADE_INTERVAL_MS,
      );
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = null;
    };
    // Don't burn timers (or fade unseen) while the tab is backgrounded.
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [cycling, images.length]);

  if (images.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden bg-black"
    >
      {(reduceMotion ? images.slice(0, 1) : images).map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.src}
          src={photo.src}
          srcSet={photo.srcSet}
          sizes={photo.srcSet ? HERO_SIZES : undefined}
          alt=""
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : undefined}
          style={{
            filter:
              "sepia(0.32) contrast(1.07) brightness(0.95) saturate(0.85)",
            objectPosition: photo.position,
          }}
          className={`absolute inset-0 h-full w-full object-cover will-change-transform ${
            i % 2 === 0
              ? "animate-[hero-kenburns-a_26s_ease-in-out_infinite_alternate]"
              : "animate-[hero-kenburns-b_26s_ease-in-out_infinite_alternate]"
          } motion-reduce:animate-none ${
            images.length > 1
              ? `transition-opacity duration-[2200ms] ease-in-out ${
                  i === active ? "opacity-100" : "opacity-0"
                }`
              : ""
          }`}
        />
      ))}

      {/* Film grain — oversized tile jittering in discrete steps. */}
      <div
        className="absolute -inset-[8%] opacity-[0.11] mix-blend-overlay animate-[hero-grain_0.9s_steps(5)_infinite] motion-reduce:animate-none"
        style={{ backgroundImage: `url("${GRAIN_URI}")`, backgroundSize: "240px 240px" }}
      />

      {/* Occasional warm light-leak sweeping across the frame. */}
      {!reduceMotion && (
        <div
          className="absolute inset-y-[-30%] left-0 w-1/3 animate-[hero-light-leak_17s_ease-in-out_infinite] mix-blend-screen"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,196,120,0.35) 45%, rgba(255,240,214,0.18) 55%, transparent)",
            filter: "blur(24px)",
          }}
        />
      )}

      {/* Vignette, then the legibility gradient. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.42) 100%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/40 to-black/75" />

      {/* Provenance caption — decorative, like a slide-mount label. */}
      {caption && (
        <span className="absolute right-3 top-3 rounded bg-black/45 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-white/55 backdrop-blur-sm md:right-4 md:top-4">
          {caption}
        </span>
      )}
    </div>
  );
}
