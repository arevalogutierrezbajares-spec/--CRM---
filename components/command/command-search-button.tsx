"use client";

import { Search } from "lucide-react";
import { openCommandPalette } from "./command-palette";

/** Topbar search affordance that opens the ⌘K command palette. */
export function CommandSearchButton() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search or run a command"
      className="hidden sm:flex h-8 items-center gap-2 rounded-md border border-[var(--border)] px-2 text-text-tertiary transition-colors hover:bg-surface hover:text-text-secondary"
    >
      <Search size={14} />
      <span className="text-tiny">Search…</span>
      <kbd className="rounded bg-surface px-1 text-[10px]">⌘K</kbd>
    </button>
  );
}
