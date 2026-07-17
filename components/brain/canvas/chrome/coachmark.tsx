"use client";

/**
 * First-run coachmark — attaches to rail search, not canvas center.
 */

import { useState } from "react";
import { focusBrainSearch } from "./brain-search-events";

const SEEN_KEY = "brain.coachmark.v3";

function hasSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function Coachmark() {
  const [hidden, setHidden] = useState(hasSeen);

  if (hidden) return null;

  return (
    <div className="brain-coachmark" role="status">
      <span>
        <b>Search the map</b>
        {" before you build · press "}
        <kbd>/</kbd>
        {" or use the left search field"}
      </span>
      <button
        type="button"
        className="brain-coachmark__go"
        onClick={() => {
          focusBrainSearch();
        }}
      >
        Search
      </button>
      <button
        type="button"
        aria-label="Dismiss tip"
        className="brain-coachmark__x"
        onClick={() => {
          try {
            localStorage.setItem(SEEN_KEY, "1");
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
