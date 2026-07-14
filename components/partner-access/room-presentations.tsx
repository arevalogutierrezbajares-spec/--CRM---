"use client";

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Play } from "lucide-react";
import { DECK_W } from "@/lib/decks/use-deck-fit";
import { useRoomDict } from "@/components/partner-access/room-i18n";

export type RoomDeck = {
  id: string;
  title: string;
  description: string | null;
  projectTitle: string | null;
};

/**
 * Dedicated "Presentaciones" surface — HTML decks pulled out of the long
 * repository list so a partner (especially on a phone) sees them first and taps
 * straight into the full-screen viewer. The newest deck leads as a featured,
 * full-width card; the rest fall into a two-up grid that stacks on mobile.
 *
 * Each card previews the real first slide via a down-scaled, non-interactive
 * iframe of the deck bytes (`/access/{token}/view/{id}`) — the same source the
 * full viewer uses — so the thumbnail is always faithful, never a stale image.
 */
export function RoomPresentations({
  token,
  decks,
}: {
  token: string;
  decks: RoomDeck[];
}) {
  const t = useRoomDict();
  if (decks.length === 0) return null;

  return (
    <section
      id="presentaciones"
      aria-label={t.decks.title}
      className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--primary)]/10 text-[var(--primary)]">
          <Clapperboard className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">{t.decks.title}</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            {t.decks.subtitle}
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs tabular-nums text-[var(--secondary-foreground)]">
          {decks.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {decks.map((deck, i) => (
          <a
            key={deck.id}
            href={`/access/${token}/deck/${deck.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] transition-all hover:border-[var(--primary)]/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              i === 0 && decks.length > 1 ? "sm:col-span-2" : ""
            }`}
          >
            <DeckThumb token={token} id={deck.id} title={deck.title} />
            <div className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-medium">{deck.title}</h3>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {deck.description || deck.projectTitle || t.decks.fallback}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)] transition-opacity group-hover:opacity-90 sm:px-2.5 sm:py-1.5">
                <Play className="h-3.5 w-3.5" fill="currentColor" />
                {t.decks.view}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * Faithful first-slide thumbnail: the deck bytes in a non-interactive iframe,
 * scaled from the fixed 1280×720 stage to whatever width the card gets. The
 * container is a 16:9 box (matching the deck), so a single width-derived scale
 * fits it exactly. pointer-events stay off — the whole card is the click target.
 */
function DeckThumb({ token, id, title }: { token: string; id: string; title: string }) {
  const t = useRoomDict();
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setScale(w > 0 ? w / DECK_W : 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative aspect-video w-full overflow-hidden border-b border-[var(--border)] bg-white"
    >
      {(!loaded || scale === 0) && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--secondary)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--muted-foreground)]/25 border-t-[var(--primary)]" />
        </div>
      )}
      {scale > 0 && (
        <iframe
          src={`/access/${token}/view/${id}`}
          title={t.decks.previewAria(title)}
          tabIndex={-1}
          aria-hidden
          onLoad={() => setLoaded(true)}
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: DECK_W,
            height: (DECK_W * 9) / 16,
            transform: `scale(${scale})`,
          }}
          sandbox="allow-scripts"
        />
      )}
      {/* Hover affordance — a soft scrim + play glyph over the live preview. */}
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
        <span className="grid h-11 w-11 translate-y-1 place-items-center rounded-full bg-white/85 text-[var(--primary)] opacity-0 shadow-lg backdrop-blur transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <Play className="h-5 w-5" fill="currentColor" />
        </span>
      </div>
    </div>
  );
}
