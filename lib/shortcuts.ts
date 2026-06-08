/**
 * Global keyboard shortcut registry. Single-key "go to" navigation uses a
 * `g`-then-key chord (Gmail/Linear style); the chips are shown in the ⌘K
 * palette and the `?` overlay so users learn them passively.
 */

export type GoTo = { keys: string; label: string; href: string };

/** `g` then the key → navigate. */
export const GO_TO: GoTo[] = [
  { keys: "h", label: "Home", href: "/" },
  { keys: "i", label: "Inbox", href: "/inbox" },
  { keys: "w", label: "My Work", href: "/work" },
  { keys: "p", label: "Priorities", href: "/priorities" },
  { keys: "r", label: "Weekly Review", href: "/review" },
  { keys: "j", label: "Lines of Business", href: "/lob" },
  { keys: "m", label: "Meetings", href: "/meetings" },
  { keys: "t", label: "Town Hall", href: "/town-hall" },
  { keys: "c", label: "Contacts", href: "/contacts" },
  { keys: "n", label: "Network", href: "/network" },
  { keys: "$", label: "Treasury", href: "/treasury" },
];

/** Map href → its `g`-chord label (e.g. "G H") for palette/overlay chips. */
export const GOTO_CHIP: Record<string, string> = Object.fromEntries(
  GO_TO.map((g) => [g.href, `G ${g.keys.toUpperCase()}`]),
);

/** Top-level single keys (shown in the `?` overlay). */
export const GLOBAL_KEYS: { keys: string; label: string }[] = [
  { keys: "⌘ K", label: "Command palette · search & go to anything" },
  { keys: "C", label: "Capture a to-do" },
  { keys: "/", label: "Search" },
  { keys: "G then …", label: "Go to a page (see below)" },
  { keys: "?", label: "This shortcuts cheat-sheet" },
];

/** True if the event target is a place where typing should win over shortcuts. */
export function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}
