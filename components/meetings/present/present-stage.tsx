"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Laptop,
  Maximize,
  Smartphone,
  X,
} from "lucide-react";
import { MaterialRenderer } from "./material-renderer";
import type { MaterialKind } from "@/db/queries/meeting-materials";

export type PresentMaterial = {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string | null;
  description: string | null;
  mimeType: string | null;
  /** Original upload filename — used to detect type when mime is generic. */
  fileName: string | null;
  lobTitle: string | null;
  /** Signed URL minted server-side for stored files. */
  fileUrl: string | null;
};

type Device = "laptop" | "phone";

export function PresentStage({
  meetingId,
  meetingTitle,
  materials,
}: {
  meetingId: string;
  meetingTitle: string;
  materials: PresentMaterial[];
}) {
  const [index, setIndex] = useState(0);
  const [device, setDevice] = useState<Device>("laptop");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const count = materials.length;
  const current = materials[index];

  // Restore the device preference for this meeting (sync from localStorage, an
  // external system — exactly what an on-mount effect is for).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`present:${meetingId}:device`);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "laptop" || saved === "phone") setDevice(saved);
    } catch {
      /* ignore */
    }
  }, [meetingId]);

  const setDevicePersist = useCallback(
    (d: Device) => {
      setDevice(d);
      try {
        localStorage.setItem(`present:${meetingId}:device`, d);
      } catch {
        /* ignore */
      }
    },
    [meetingId],
  );

  const go = useCallback(
    (n: number) => setIndex(Math.max(0, Math.min(count - 1, n))),
    [count],
  );
  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    window.location.href = `/meetings/${meetingId}`;
  }, [meetingId]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // Auto-hide controls after idle; reveal on any pointer move.
  const nudgeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2800);
  }, []);

  // Start the idle-hide countdown on mount (controls already default visible, so
  // no synchronous setState needed here). Also fade the one-time keyboard hint.
  useEffect(() => {
    hideTimer.current = setTimeout(() => setControlsVisible(false), 2800);
    const hintTimer = setTimeout(() => setHintVisible(false), 4500);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      clearTimeout(hintTimer);
    };
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        next();
        nudgeControls();
        setHintVisible(false);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        prev();
        nudgeControls();
        setHintVisible(false);
      } else if (e.key === "Escape") {
        // Esc exits fullscreen first (native), then leaves on a second press.
        if (!document.fullscreenElement) exit();
      } else if (e.key === "f") {
        toggleFullscreen();
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(count - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, exit, toggleFullscreen, go, count, nudgeControls]);

  if (count === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-lg font-medium">No materials to present.</p>
        <p className="text-sm text-neutral-400">
          Add a deck, file, or link to this meeting first.
        </p>
        <a
          href={`/meetings/${meetingId}`}
          className="mt-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Back to meeting
        </a>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-black"
      onMouseMove={nudgeControls}
      onTouchStart={nudgeControls}
    >
      {/* Stage */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
        <div
          className={
            device === "phone"
              ? "relative h-full max-h-[844px] w-full max-w-[390px] overflow-hidden rounded-[2rem] border-4 border-neutral-800 bg-black shadow-2xl"
              : "relative h-full w-full max-w-[1600px] overflow-hidden rounded-lg bg-black shadow-2xl"
          }
        >
          {/* key forces a clean remount when switching materials (resets iframes) */}
          <div key={current.id} className="flex h-full w-full items-center justify-center">
            <MaterialRenderer material={current} />
          </div>
        </div>
      </div>

      {/* Top bar: title + device toggle + exit */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-5 py-4 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto min-w-0">
          <div className="truncate text-sm font-medium text-white/90">
            {meetingTitle}
          </div>
          <div className="truncate text-xs text-white/50">{current.label}</div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex items-center rounded-full bg-white/10 p-0.5 backdrop-blur">
            <button
              type="button"
              onClick={() => setDevicePersist("laptop")}
              aria-label="Laptop view"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                device === "laptop"
                  ? "bg-white text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Laptop className="h-3.5 w-3.5" /> Laptop
            </button>
            <button
              type="button"
              onClick={() => setDevicePersist("phone")}
              aria-label="Phone view"
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                device === "phone"
                  ? "bg-white text-black"
                  : "text-white/70 hover:text-white"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" /> Phone
            </button>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur hover:bg-white/20 hover:text-white"
          >
            <Maximize className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={exit}
            aria-label="Exit present mode"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* One-time keyboard hint, auto-fades */}
      <div
        className={`pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80 backdrop-blur transition-opacity duration-500 ${
          hintVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="font-medium">←</span>{" "}
        <span className="font-medium">→</span> navigate ·{" "}
        <span className="font-medium">F</span> fullscreen ·{" "}
        <span className="font-medium">Esc</span> exit
      </div>

      {/* Bottom bar: prev / dots / next */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-5 py-4 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="pointer-events-auto flex max-w-[60vw] items-center gap-1.5 overflow-x-auto">
          {materials.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to ${m.label}`}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>

        <span className="pointer-events-auto min-w-[3rem] text-center text-xs tabular-nums text-white/60">
          {index + 1} / {count}
        </span>

        <button
          type="button"
          onClick={next}
          disabled={index === count - 1}
          aria-label="Next"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
