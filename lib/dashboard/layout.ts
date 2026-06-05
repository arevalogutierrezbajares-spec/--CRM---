/** Home dashboard layout — shared by the client editor and the server. */

export type WidgetSize = "compact" | "standard" | "wide" | "full";
type LegacyWidgetWidth = "half" | "full";
export type DashWidget = { id: string; hidden: boolean; size: WidgetSize };

/** Canonical widgets + default order/size. New widgets append here. */
export const DEFAULT_WIDGETS: DashWidget[] = [
  { id: "town_hall", hidden: false, size: "wide" },
  { id: "action_items", hidden: false, size: "standard" },
  { id: "tasks", hidden: false, size: "wide" },
  { id: "pinned", hidden: false, size: "standard" },
  { id: "relationships", hidden: false, size: "standard" },
  { id: "ai", hidden: false, size: "wide" },
  { id: "scorecard", hidden: false, size: "full" },
];

export const WIDGET_LABELS: Record<string, string> = {
  town_hall: "Town Hall",
  pinned: "Pinned projects",
  action_items: "Action items",
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
