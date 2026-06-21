/**
 * THE BRAIN — seed-then-pin stable positioning (NFR-LAYOUT-2).
 *
 * "Spatial memory": once a node has a position, it KEEPS it across re-renders,
 * lens switches, and axis toggles. A node never jumps. The pin store is keyed
 * by node id; it is seeded from the node's authored `pos` (from the graph
 * artifact / sample) and only filled from a layout pass when no seed exists.
 *
 * This is a plain in-memory map, intentionally module-scoped so positions
 * persist for the lifetime of the page session. Determinism (NFR-LAYOUT-1) is
 * preserved because seeds come from the deterministic artifact and any
 * computed fills come from the deterministic radial layout.
 *
 * Persistence: `loadPins()` / `savePins()` read/write `brain.pins.v1` in
 * localStorage. Both are SSR-safe — they guard on `typeof window`. Call
 * `loadPins()` once on mount (e.g. in the canvas `useEffect`) to restore
 * positions from the previous session, and `savePins()` any time you want to
 * flush the current map (e.g. before unload, or after any `setPinned` call).
 */

import type { XY } from "../types";

/** id → pinned position. Module-scoped: stable for the session. */
const PINS = new Map<string, XY>();

/** Read a pinned position, or undefined if the node has never been placed. */
export function getPinned(id: string): XY | undefined {
  return PINS.get(id);
}

/** Pin (or re-pin) a node's position. Idempotent for equal coordinates. */
export function setPinned(id: string, pos: XY): void {
  PINS.set(id, { x: pos.x, y: pos.y });
}

/**
 * Seed the pin store from a node's authored position WITHOUT overwriting an
 * existing pin. Use this when loading the graph: `node.pos` becomes the stable
 * slot the first time the node is seen, and survives thereafter.
 */
export function seedPin(id: string, pos: XY): XY {
  const existing = PINS.get(id);
  if (existing) return existing;
  const seeded = { x: pos.x, y: pos.y };
  PINS.set(id, seeded);
  return seeded;
}

/**
 * Resolve a position for a node: prefer the existing pin, else fall back to the
 * provided computed/seed position and pin it. Guarantees a node, once placed,
 * never moves (seed-then-pin).
 */
export function resolvePin(id: string, fallback: XY): XY {
  const existing = PINS.get(id);
  if (existing) return existing;
  return seedPin(id, fallback);
}

/** Whether a node currently has a pinned slot. */
export function hasPin(id: string): boolean {
  return PINS.has(id);
}

/** Drop a single pin (e.g. when a node is removed from the graph). */
export function clearPin(id: string): void {
  PINS.delete(id);
}

/** Reset the entire pin store (test/dev hot-reload safety). */
export function clearAllPins(): void {
  PINS.clear();
}

/** Snapshot the current pin map (defensive copy) — for debugging/persistence. */
export function snapshotPins(): Record<string, XY> {
  const out: Record<string, XY> = {};
  for (const [id, pos] of PINS) out[id] = { x: pos.x, y: pos.y };
  return out;
}

/* ── localStorage persistence (SSR-safe) ──────────────────────────────────── */

const PINS_KEY = "brain.pins.v1";

/**
 * Load persisted pins from localStorage into the in-memory PINS map.
 * Uses `seedPin` semantics: already-pinned ids are NOT overwritten, so the
 * authored `pos` (seeded before mount) always wins over stale persisted data.
 *
 * Call once inside a client-side `useEffect` on mount. Safe to call on SSR —
 * returns immediately (no-op) when `window` is not defined.
 */
export function loadPins(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, XY>;
    for (const [id, pos] of Object.entries(parsed)) {
      if (
        typeof pos === "object" &&
        pos !== null &&
        typeof pos.x === "number" &&
        typeof pos.y === "number"
      ) {
        // seed semantics: don't overwrite an already-pinned node
        seedPin(id, pos);
      }
    }
  } catch {
    // Corrupt entry — silently ignore; pins will re-seed from authored data.
  }
}

/**
 * Persist the current in-memory PINS map to localStorage.
 * Safe to call on SSR — returns immediately when `window` is not defined.
 */
export function savePins(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(snapshotPins()));
  } catch {
    // Storage full or blocked — positions still work in-memory for the session.
  }
}
