/** Home dashboard layout — shared by the client editor and the server. */

export type WidgetSize = "compact" | "standard" | "wide" | "full";
type LegacyWidgetWidth = "half" | "full";
export type DashWidget = { id: string; hidden: boolean; size: WidgetSize };

/**
 * Bump when the *default* arrangement changes structurally. A saved layout from
 * an older version is discarded once (re-seeded to DEFAULT_WIDGETS) so everyone
 * adopts the new baseline; after the user re-customizes it persists at this
 * version. See readLayout().
 *   v2 — Town Hall full-width up top, Tasks under Pinned, Action items moved to
 *        the right rail (no longer a grid widget).
 *   v3 — Tasks/AI/Scorecard full-width stacked (no leftover grid gaps); Pinned
 *        pairs with Relationships on its row, Tasks sits full-width beneath.
 */
export const LAYOUT_VERSION = 3;

/** Canonical widgets + default order/size. New widgets append here.
 *  NOTE: `action_items` intentionally lives in the right rail now, not the grid.
 *  Sizes chosen so every row fills cleanly (no empty trailing cells):
 *  Pinned(8)+Relationships(4) share a row; Tasks/AI/Scorecard each span full. */
export const DEFAULT_WIDGETS: DashWidget[] = [
  { id: "town_hall", hidden: false, size: "full" },
  { id: "pinned", hidden: false, size: "wide" },
  { id: "relationships", hidden: false, size: "standard" },
  { id: "tasks", hidden: false, size: "full" },
  { id: "ai", hidden: false, size: "full" },
  { id: "scorecard", hidden: false, size: "full" },
];

export const WIDGET_LABELS: Record<string, string> = {
  town_hall: "Town Hall",
  pinned: "Pinned projects",
  tasks: "Tasks",
  relationships: "Relationships",
  scorecard: "Scorecard",
  ai: "AI assistant",
};

const KNOWN = new Set(DEFAULT_WIDGETS.map((w) => w.id));
const DEFAULT_BY_ID = new Map(DEFAULT_WIDGETS.map((w) => [w.id, w]));

function isSize(value: unknown): value is WidgetSize {
  return value === "compact" || value === "standard" || value === "wide" || value === "full";
}

function legacySize(width: unknown): WidgetSize | null {
  if ((width as LegacyWidgetWidth) === "full") return "full";
  if ((width as LegacyWidgetWidth) === "half") return "standard";
  return null;
}

/**
 * Merge a saved layout with the defaults: keep saved order/size/hidden for
 * known ids, append widgets added in a later release at the end, drop unknowns.
 * Tolerant of malformed input (returns defaults).
 */
export function resolveLayout(saved: unknown): DashWidget[] {
  const arr = Array.isArray(saved) ? saved : [];
  const valid: DashWidget[] = [];
  const seen = new Set<string>();
  for (const w of arr) {
    if (!w || typeof w !== "object") continue;
    const id = (w as { id?: unknown }).id;
    if (typeof id !== "string" || !KNOWN.has(id) || seen.has(id)) continue;
    seen.add(id);
    const raw = w as { hidden?: unknown; size?: unknown; width?: unknown };
    const defaultSize = DEFAULT_BY_ID.get(id)?.size ?? "standard";
    valid.push({
      id,
      hidden: Boolean(raw.hidden),
      size: isSize(raw.size) ? raw.size : legacySize(raw.width) ?? defaultSize,
    });
  }
  const appended = DEFAULT_WIDGETS.filter((d) => !seen.has(d.id));
  return [...valid, ...appended];
}

/** The shape we persist: a versioned wrapper around the widget array. */
export type StoredLayout = { v: number; widgets: DashWidget[] };

/** Pack a sanitized widget array into the versioned persistence shape. */
export function packLayout(widgets: DashWidget[]): StoredLayout {
  return { v: LAYOUT_VERSION, widgets: resolveLayout(widgets) };
}

/**
 * Read a layout from storage. Only a wrapper saved at the *current*
 * LAYOUT_VERSION is honored (merged with defaults); anything older — a legacy
 * bare array, an out-of-date version, or null — is discarded and re-seeded to
 * the current DEFAULT_WIDGETS so the user adopts the new baseline once.
 */
export function readLayout(stored: unknown): DashWidget[] {
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    const obj = stored as { v?: unknown; widgets?: unknown };
    if (obj.v === LAYOUT_VERSION) return resolveLayout(obj.widgets);
  }
  return DEFAULT_WIDGETS.map((w) => ({ ...w }));
}
