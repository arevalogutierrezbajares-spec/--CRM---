/**
 * Shared search focus events — NO React, NO GraphProvider.
 * Safe to import from TopBar (outside the canvas provider tree).
 */

export const BRAIN_FOCUS_SEARCH = "brain:focus-search";

export function focusBrainSearch(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BRAIN_FOCUS_SEARCH));
}
