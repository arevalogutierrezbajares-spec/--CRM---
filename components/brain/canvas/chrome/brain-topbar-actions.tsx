"use client";

/**
 * TopBar chip — outside GraphProvider. Must never import graph-provider
 * or brain-search (those pull context into a separate bundle).
 */

import { Search } from "lucide-react";
import { focusBrainSearch } from "./brain-search-events";

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
