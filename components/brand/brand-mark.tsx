"use client";

import { BRAND_INTRO_REPLAY_EVENT } from "./brand-widget";

/**
 * Sidebar brand lockup — pillars mark + "AGB Technologies" with the initials
 * oversized. Clicking it plays the brand animation inline in the top-right
 * BrandWidget (no popup).
 */
export function BrandMark({ rail = false }: { rail?: boolean }) {
  const replay = () => window.dispatchEvent(new Event(BRAND_INTRO_REPLAY_EVENT));

  if (rail) {
    return (
      <button
        type="button"
        onClick={replay}
        title="AGB Technologies — replay intro"
        aria-label="AGB Technologies — replay intro"
        className="flex items-center justify-center rounded transition-opacity hover:opacity-80 active:scale-[0.96]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/crm.svg" alt="" aria-hidden width={26} height={26} className="shrink-0 dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/crm-light.svg" alt="" aria-hidden width={26} height={26} className="shrink-0 hidden dark:block" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={replay}
      title="Replay intro"
      aria-label="AGB Technologies — replay intro"
      className="flex min-w-0 items-center gap-2 rounded transition-opacity hover:opacity-80 active:scale-[0.98]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/crm.svg" alt="" aria-hidden width={28} height={28} className="shrink-0 dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logos/crm-light.svg" alt="" aria-hidden width={28} height={28} className="shrink-0 hidden dark:block" />
      <span className="truncate text-[15px] leading-none tracking-tight text-text-primary">
        <span className="font-bold">AGB</span> <span className="font-medium">Technologies</span>
      </span>
    </button>
  );
}
