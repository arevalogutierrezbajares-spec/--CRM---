"use client";

/**
 * TopBar chip — lives OUTSIDE GraphProvider (page shell).
 * Must not call useBrain(); only dispatches focus to rail search.
 */

import { Search } from "lucide-react";
import { focusBrainSearch } from "./brain-search";

export function BrainTopBarActions() {
  return (
    <button
      type="button"
      className="brain-search-chip"
      onClick={() => focusBrainSearch()}
      aria-label="Search portfolio map"
      title="Search map (/)"
    >
      <Search size={14} strokeWidth={2} aria-hidden />
      <span className="brain-search-chip__label">Search map</span>
      <kbd className="brain-search-chip__kbd">/</kbd>
    </button>
  );
}
