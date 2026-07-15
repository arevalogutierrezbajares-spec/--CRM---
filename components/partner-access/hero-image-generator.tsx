"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  generateRoomHeroImageAction,
  removeRoomHeroImageAction,
} from "@/app/(app)/partner-access/actions";
import { HERO_IMAGE_THEMES } from "@/lib/partner-room-hero-images";

/**
 * Generate a bespoke hero background with Grok — South American nature
 * scenes. Pick a theme (or leave "Auto" for the room's own deterministic
 * pick), generate, and the room hero updates. A preset video, if set,
 * takes precedence over the image on the guest page.
 */
export function HeroImageGenerator({
  roomId,
  heroImageTheme,
  heroImageUrl,
  hasHeroVideo,
}: {
  roomId: string;
  heroImageTheme: string | null;
  heroImageUrl: string | null;
  hasHeroVideo: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [theme, setTheme] = useState<string | null>(heroImageTheme);
  const [imageUrl, setImageUrl] = useState<string | null>(heroImageUrl);

  function generate() {
    if (pending) return;
    startTransition(async () => {
      const res = await generateRoomHeroImageAction({ roomId, themeKey: theme });
      if (res.ok) {
        setTheme(res.themeKey);
        setImageUrl(res.url);
        toast.success(`Hero image generated — ${res.themeLabel}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    if (pending || !imageUrl) return;
    startTransition(async () => {
      const res = await removeRoomHeroImageAction({ roomId });
      if (res.ok) {
        setImageUrl(null);
        toast.success("Hero image removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Grok paints a South American nature scene behind the welcome header.
        {hasHeroVideo && (
          <span className="text-[var(--foreground)]/80">
            {" "}
            The background video is set and takes precedence — remove it to
            show the image.
          </span>
        )}
      </p>

      {imageUrl && (
        <div className="relative mt-3 aspect-[2/1] overflow-hidden rounded-lg border border-[var(--border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Generated hero" className="h-full w-full object-cover" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTheme(null)}
          disabled={pending}
          aria-pressed={theme === null}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            theme === null
              ? "border-[var(--primary)] bg-[var(--secondary)] font-medium"
              : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          }`}
        >
          Auto
        </button>
        {HERO_IMAGE_THEMES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTheme(t.key)}
            disabled={pending}
            aria-pressed={theme === t.key}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              theme === t.key
                ? "border-[var(--primary)] bg-[var(--secondary)] font-medium"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-1.5 text-xs font-medium transition-colors hover:border-[var(--primary)]/50 disabled:opacity-60"
        >
          <Sparkles className={`h-3.5 w-3.5 ${pending ? "animate-pulse" : ""}`} />
          {pending
            ? "Generating with Grok…"
            : imageUrl
              ? "Regenerate"
              : "Generate with Grok"}
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] disabled:opacity-60"
          >
            <ImageOff className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
      </div>
      {pending && (
        <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
          This usually takes 10–30 seconds.
        </p>
      )}
    </div>
  );
}
