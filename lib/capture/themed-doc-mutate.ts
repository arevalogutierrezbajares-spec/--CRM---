/**
 * El Cuaderno Slice 2 — pure themed-document mutations.
 *
 * The operator can, after a call is filed, re-file a stray marker into a theme
 * (or spin up a new one) and strike an AI block he disagrees with. These are the
 * two mutations behind the assign-theme / strike routes. Everything here is PURE
 * (no db, no network) and IMMUTABLE (never mutates the input doc) so the routes
 * stay thin and the logic is exhaustively unit-testable.
 */
import { slugifyThemeLabel } from "./validate";
import type {
  ThemedDoc,
  ThemedDocTheme,
  ThemedDocAgendaItem,
  ThemeEvidence,
} from "./themed-doc";

/** Match tolerance when locating an evidence item by its timestamp. */
export const ASSIGN_MATCH_TOLERANCE_SECS = 0.5;

/** Which evidence item to move: its type + (approximate) timestamp. */
export type EvidenceLocator = { tSecs: number; type: "note" | "flag" };

/** Where to file it: an existing theme by key, or a brand-new theme from a label. */
export type AssignTarget =
  | { kind: "existing"; themeKey: string }
  | { kind: "new"; label: string };

/** What to strike: a theme's AI block, or the call sentence. */
export type StrikeTarget =
  | { kind: "theme"; themeKey: string }
  | { kind: "callSentence" };

const byTime = (a: ThemeEvidence, b: ThemeEvidence) => a.tSecs - b.tSecs;

/** True when a theme's ai block carries at least one bullet. */
function hasAi(t: ThemedDocTheme): boolean {
  return (
    t.ai !== null &&
    t.ai.committed.length + t.ai.decided.length + t.ai.open.length > 0
  );
}

/**
 * Recompute agenda coverage after an evidence move. A 'done' mark is STICKY —
 * the operator said that item is handled, so a re-file never demotes it. Every
 * other item is evidence-based: the theme keyed to the agenda item has ≥1
 * evidence → 'covered', else 'gap'.
 */
function recomputeAgendaCoverage(
  themes: ThemedDocTheme[],
  agenda: ThemedDocAgendaItem[],
): ThemedDocAgendaItem[] {
  const themeByKey = new Map(themes.map((t) => [t.key, t]));
  return agenda.map((a) => {
    if (a.coverage === "done") return a; // sticky — operator marked it handled
    const theme = themeByKey.get(a.key);
    return {
      ...a,
      coverage: theme && theme.evidence.length > 0 ? "covered" : "gap",
    };
  });
}

/**
 * Move a single evidence item into a theme. The item is located in `unfiled`
 * first, then (a re-file) in any theme's evidence — matched by type + a ±0.5s
 * timestamp window. Target 'existing' requires the theme to already be present;
 * target 'new' slugifies the label (no-op-slug ⇒ null) and creates a live theme
 * — appending instead if a theme with that slug already exists. Live source
 * themes left empty by the move are pruned (mirrors buildThemedDoc), agenda
 * items with the same slug seed the new theme's agendaItemKey, and agenda
 * coverage is recomputed. Returns a new doc, or null when the item can't be
 * found or the target is unusable (route ⇒ 400).
 */
export function assignEvidence(
  doc: ThemedDoc,
  locator: EvidenceLocator,
  target: AssignTarget,
): ThemedDoc | null {
  const matches = (e: ThemeEvidence) =>
    e.type === locator.type &&
    Math.abs(e.tSecs - locator.tSecs) <= ASSIGN_MATCH_TOLERANCE_SECS;

  // Work on shallow-cloned evidence arrays so the input doc is never mutated.
  let themes: ThemedDocTheme[] = doc.themes.map((t) => ({
    ...t,
    evidence: [...t.evidence],
  }));
  let unfiled = doc.unfiled;

  // 1. Locate the item — unfiled first, then any theme (re-file).
  let item: ThemeEvidence | null = null;
  const unfiledIdx = doc.unfiled.findIndex(matches);
  if (unfiledIdx >= 0) {
    item = doc.unfiled[unfiledIdx];
    unfiled = doc.unfiled.filter((_, i) => i !== unfiledIdx);
  } else {
    for (const t of themes) {
      const idx = t.evidence.findIndex(matches);
      if (idx >= 0) {
        item = t.evidence[idx];
        t.evidence.splice(idx, 1);
        break;
      }
    }
  }
  if (!item) return null;

  // 2. Resolve + file into the target theme.
  const append = (t: ThemedDocTheme) => {
    t.evidence.push(item!);
    t.evidence.sort(byTime);
  };
  if (target.kind === "existing") {
    const theme = themes.find((t) => t.key === target.themeKey);
    if (!theme) return null; // themeKey must reference an existing theme
    append(theme);
  } else {
    const slug = slugifyThemeLabel(target.label);
    if (!slug) return null; // nothing sluggable — unusable target
    const existing = themes.find((t) => t.key === slug);
    if (existing) {
      append(existing);
    } else {
      const agendaKeys = new Set(doc.agenda.map((a) => a.key));
      themes.push({
        key: slug,
        label: target.label.trim(),
        origin: "live",
        agendaItemKey: agendaKeys.has(slug) ? slug : null,
        evidence: [item],
        ai: null,
      });
    }
  }

  // 3. Prune live themes emptied by the move (agenda themes stay as gaps).
  themes = themes.filter(
    (t) => t.evidence.length > 0 || t.origin === "agenda" || hasAi(t),
  );

  return {
    ...doc,
    themes,
    unfiled,
    agenda: recomputeAgendaCoverage(themes, doc.agenda),
  };
}

/**
 * Strike an AI contribution the operator disagrees with. 'theme' nulls that
 * theme's ai block (returns null if the theme is unknown ⇒ route 400);
 * 'callSentence' nulls the call sentence. Evidence and coverage are untouched —
 * striking AI never changes what the operator captured. Returns a new doc.
 */
export function strike(doc: ThemedDoc, target: StrikeTarget): ThemedDoc | null {
  if (target.kind === "callSentence") {
    return { ...doc, callSentence: null };
  }
  if (!doc.themes.some((t) => t.key === target.themeKey)) return null;
  return {
    ...doc,
    themes: doc.themes.map((t) =>
      t.key === target.themeKey ? { ...t, ai: null } : t,
    ),
  };
}
