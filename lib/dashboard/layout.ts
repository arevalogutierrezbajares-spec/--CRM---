/** Home dashboard layout — shared by the client editor and the server. */

export type WidgetWidth = "half" | "full";
export type DashWidget = { id: string; hidden: boolean; width: WidgetWidth };

/** Canonical widgets + default order/width. New widgets append here. */
export const DEFAULT_WIDGETS: DashWidget[] = [
  { id: "pinned", hidden: false, width: "full" },
  { id: "action_items", hidden: false, width: "half" },
  { id: "tasks", hidden: false, width: "half" },
  { id: "meetings", hidden: false, width: "half" },
  { id: "projects", hidden: false, width: "half" },
  { id: "ai", hidden: false, width: "full" },
];

export const WIDGET_LABELS: Record<string, string> = {
  pinned: "Pinned projects",
  action_items: "Action items",
  tasks: "Tasks",
  meetings: "Meetings",
  projects: "Projects",
  ai: "AI assistant",
};

const KNOWN = new Set(DEFAULT_WIDGETS.map((w) => w.id));

/**
 * Merge a saved layout with the defaults: keep saved order/width/hidden for
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
    valid.push({
      id,
      hidden: Boolean((w as { hidden?: unknown }).hidden),
      width: (w as { width?: unknown }).width === "full" ? "full" : "half",
    });
  }
  const appended = DEFAULT_WIDGETS.filter((d) => !seen.has(d.id));
  return [...valid, ...appended];
}
