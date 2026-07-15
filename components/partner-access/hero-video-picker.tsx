"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, VideoOff } from "lucide-react";
import { toast } from "sonner";
import { setRoomHeroVideoAction } from "@/app/(app)/partner-access/actions";
import { ROOM_HERO_VIDEOS } from "@/lib/partner-room-videos";
import { ROOM_HERO_PHOTO_SETS } from "@/lib/partner-room-photos";

/**
 * Pick the ambient background for the room hero — a preset video loop, an
 * archive photo set (living-film treatment), or none. Thumbnails are the
 * poster frames; click to apply. One choice per room (shared preset key).
 */
export function HeroVideoPicker({
  roomId,
  heroVideoKey,
}: {
  roomId: string;
  heroVideoKey: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(heroVideoKey);

  function apply(key: string | null) {
    if (pending || key === selected) return;
    const previous = selected;
    setSelected(key);
    startTransition(async () => {
      const res = await setRoomHeroVideoAction({ roomId, heroVideoKey: key });
      if (res.ok) {
        toast.success(key ? "Hero background updated" : "Hero background removed");
        router.refresh();
      } else {
        setSelected(previous);
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Plays behind the welcome header on the partner&rsquo;s room.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => apply(null)}
          disabled={pending}
          aria-pressed={selected === null}
          className={`relative flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border text-[11px] transition-colors ${
            selected === null
              ? "border-[var(--primary)] bg-[var(--secondary)] font-medium"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          }`}
        >
          <VideoOff className="h-4 w-4" />
          None
        </button>
        {ROOM_HERO_VIDEOS.map((video) => {
          const active = selected === video.key;
          return (
            <button
              key={video.key}
              type="button"
              onClick={() => apply(video.key)}
              disabled={pending}
              aria-pressed={active}
              className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${
                active
                  ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
                  : "border-[var(--border)] hover:border-[var(--border-emphasis,var(--border))]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={video.poster}
                alt={video.label}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-medium text-white">
                {video.label}
              </span>
              {active && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
        {ROOM_HERO_PHOTO_SETS.map((set) => {
          const active = selected === set.key;
          return (
            <button
              key={set.key}
              type="button"
              onClick={() => apply(set.key)}
              disabled={pending}
              aria-pressed={active}
              className={`group relative aspect-video overflow-hidden rounded-lg border transition-colors ${
                active
                  ? "border-[var(--primary)] ring-1 ring-[var(--primary)]"
                  : "border-[var(--border)] hover:border-[var(--border-emphasis,var(--border))]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={set.images[0].src}
                alt={set.label}
                className="h-full w-full object-cover sepia-[.3] transition-transform group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-3 text-left text-[10px] font-medium text-white">
                {set.label}
              </span>
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-white/90">
                Film
              </span>
              {active && (
                <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
