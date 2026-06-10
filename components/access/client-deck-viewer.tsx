"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useDeckFit, DECK_W, DECK_H } from "@/lib/decks/use-deck-fit";

/**
 * Full-screen client-facing HTML deck viewer. Decks are built for a fixed
 * 1280×720 desktop stage (center origin, no flex-centered body), so on a phone
 * they mis-center and clip. Render on a fixed 1280×720 canvas, scaled to fit —
 * and rotate 90° on a portrait phone so a landscape deck fills the screen.
 */
export function ClientDeckViewer({
  src,
  title,
  backHref,
}: {
  src: string;
  title: string;
  backHref: string;
}) {
  const { ref: wrapRef, scale, rotate } = useDeckFit();
  const [loaded, setLoaded] = useState(false);

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <a
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-white/70 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
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
              transform: `translate(-50%, -50%) rotate(${rotate ? 90 : 0}deg) scale(${scale})`,
              transformOrigin: "center center",
            }}
            sandbox="allow-scripts allow-popups allow-forms"
          />
        )}
      </div>
    </main>
  );
}
