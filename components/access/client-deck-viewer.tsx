"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";

/**
 * Full-screen client-facing HTML deck viewer. Decks are built for a fixed
 * 1280×720 desktop stage (center transform-origin, no flex-centered body), so on
 * a phone they mis-center and clip. Render the deck on a fixed 1280×720 logical
 * canvas and CSS-scale it to fit the viewport — full and centered on any device.
 */
const DECK_W = 1280;
const DECK_H = 720;

export function ClientDeckViewer({
  src,
  title,
  backHref,
}: {
  src: string;
  title: string;
  backHref: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // ResizeObserver fires on observe + every resize; setState here is in an
    // async callback (not the effect body), so it's lint-safe.
    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(width / DECK_W, height / DECK_H);
      setScale(s > 0 && Number.isFinite(s) ? s : 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </a>
        <div className="truncate text-sm font-medium text-white/80">{title}</div>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/50 transition-colors hover:text-white"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open
        </a>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        {(!loaded || scale === 0) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          </div>
        )}
        {scale > 0 && (
          <iframe
            src={src}
            title={title}
            onLoad={() => setLoaded(true)}
            className="absolute left-1/2 top-1/2 border-0 bg-white"
            style={{
              width: DECK_W,
              height: DECK_H,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: "center center",
            }}
            sandbox="allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </main>
  );
}
