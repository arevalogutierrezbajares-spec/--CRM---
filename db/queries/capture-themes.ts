/**
 * El Cuaderno Slice 2 — cross-call theme timeline (READ side).
 *
 * Every filed themed call writes one `call_theme_facets` rollup row per theme
 * (see replaceCallThemeFacets in call-recordings.ts). In Slice 1 those rows
 * carry `theme_id = null`, so facets are keyed by their denormalized `label`.
 *
 * These queries group facets by the SAME slug the helper computes from a label
 * (slugifyThemeLabel — NFD-strip diacritics, lowercase, non-alnum→hyphen, ≤48).
 * Doing the slug in TS (not SQL) is the robust join: it matches the helper's
 * rule exactly, folds label variants that collide on a key (e.g. "Pricing" /
 * "pricing" / "Pricing!") into one theme, and stays diacritic-correct where a
 * bare SQL `lower(regexp_replace(...))` would not (no unaccent dependency).
 *
 * Every query is workspace-fenced on `call_theme_facets.workspace_id` (and the
 * recording join is fenced too, defensively) — a facet from another workspace
 * is never returned.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { slugifyThemeLabel } from "@/lib/capture/validate";
import type { ThemedDoc, ThemedDocTheme } from "@/lib/capture/themed-doc";

const { callThemeFacets, callRecordings } = schema;

/** Facet coverage buckets surfaced in the timeline rollup distribution. */
export type CoverageDistribution = { done: number; covered: number; gap: number };

/** One call in a theme's timeline (per-call rollup, newest first). */
export type ThemeTimelineCall = {
  callId: string;
  callTitle: string;
  callDate: Date;
  noteCount: number;
  quoteCount: number;
  flagCount: number;
  coverage: string; // 'covered' | 'partial' | 'gap' (as filed)
};

/** Cross-call rollup for one theme. */
export type ThemeTimelineRollup = {
  callCount: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  coverage: CoverageDistribution;
};

export type ThemeTimeline = {
  key: string;
  /** Display label of the most-recent facet under this key; null if empty. */
  label: string | null;
  rollup: ThemeTimelineRollup;
  calls: ThemeTimelineCall[];
};

/** One entry in the "what themes recur" index. */
export type WorkspaceThemeItem = {
  key: string;
  label: string;
  callCount: number;
  lastSeen: Date;
};

/** Coverage-merge priority when a single call has >1 facet colliding on a key. */
const COVERAGE_RANK: Record<string, number> = { done: 3, covered: 2, partial: 1, gap: 0 };

function betterCoverage(a: string, b: string): string {
  return (COVERAGE_RANK[b] ?? -1) > (COVERAGE_RANK[a] ?? -1) ? b : a;
}

/**
 * Timeline of every call that touched theme `key`, newest call first, plus a
 * cross-call rollup (total calls, first/last seen, coverage distribution).
 *
 * Facets are grouped by slugified label so the key matches the helper exactly.
 * A call with multiple facets colliding on `key` (rare: distinct labels that
 * slug the same) is merged into ONE timeline entry — counts summed, coverage
 * taken at its best. A non-existent theme yields an empty, valid result.
 */
export async function getThemeTimeline(opts: {
  workspaceId: string;
  key: string;
  limit?: number;
}): Promise<ThemeTimeline> {
  const { workspaceId, key, limit = 10 } = opts;

  const rows = await db
    .select({
      callId: callThemeFacets.callId,
      callTitle: callRecordings.title,
      callDate: callThemeFacets.callDate,
      noteCount: callThemeFacets.noteCount,
      quoteCount: callThemeFacets.quoteCount,
      flagCount: callThemeFacets.flagCount,
      coverage: callThemeFacets.coverage,
      label: callThemeFacets.label,
    })
    .from(callThemeFacets)
    .innerJoin(
      callRecordings,
      and(
        eq(callRecordings.id, callThemeFacets.callId),
        eq(callRecordings.workspaceId, workspaceId),
      ),
    )
    .where(eq(callThemeFacets.workspaceId, workspaceId))
    .orderBy(desc(callThemeFacets.callDate));

  // Keep only facets whose label slugs to `key` (the robust key↔label join).
  const matching = rows.filter((r) => slugifyThemeLabel(r.label) === key);

  // Collapse to one entry per call (facets are per-call-per-theme, but two
  // distinct labels can slug-collide within a single call — merge them).
  const byCall = new Map<string, ThemeTimelineCall>();
  // Display label = the spelling on the newest facet (order-independent).
  let label: string | null = null;
  let labelDate: Date | null = null;
  for (const r of matching) {
    if (!labelDate || r.callDate > labelDate) {
      labelDate = r.callDate;
      label = r.label;
    }
    const existing = byCall.get(r.callId);
    if (existing) {
      existing.noteCount += r.noteCount;
      existing.quoteCount += r.quoteCount;
      existing.flagCount += r.flagCount;
      existing.coverage = betterCoverage(existing.coverage, r.coverage);
    } else {
      byCall.set(r.callId, {
        callId: r.callId,
        callTitle: r.callTitle,
        callDate: r.callDate,
        noteCount: r.noteCount,
        quoteCount: r.quoteCount,
        flagCount: r.flagCount,
        coverage: r.coverage,
      });
    }
  }

  // Newest call first — sorted explicitly so the result never depends on SQL
  // row order (ties, future query changes).
  const calls = [...byCall.values()].sort(
    (a, b) => b.callDate.getTime() - a.callDate.getTime(),
  );

  const coverage: CoverageDistribution = { done: 0, covered: 0, gap: 0 };
  let firstSeen: Date | null = null;
  let lastSeen: Date | null = null;
  for (const c of calls) {
    if (c.coverage in coverage) coverage[c.coverage as keyof CoverageDistribution] += 1;
    if (!firstSeen || c.callDate < firstSeen) firstSeen = c.callDate;
    if (!lastSeen || c.callDate > lastSeen) lastSeen = c.callDate;
  }

  return {
    key,
    label,
    rollup: { callCount: calls.length, firstSeen, lastSeen, coverage },
    calls: calls.slice(0, limit),
  };
}

/**
 * The "what themes recur" index: every distinct theme (by slugified label)
 * across the workspace's facets, with how many calls touched it and when it was
 * last seen. Ordered by most-recent activity first.
 */
export async function listWorkspaceThemes(opts: {
  workspaceId: string;
  limit?: number;
}): Promise<WorkspaceThemeItem[]> {
  const { workspaceId, limit = 50 } = opts;

  const rows = await db
    .select({
      callId: callThemeFacets.callId,
      callDate: callThemeFacets.callDate,
      label: callThemeFacets.label,
    })
    .from(callThemeFacets)
    .where(eq(callThemeFacets.workspaceId, workspaceId))
    .orderBy(desc(callThemeFacets.callDate));

  // Group by slug. lastSeen + display label track the newest facet in the group
  // (order-independent — never relies on SQL row order).
  const groups = new Map<
    string,
    { label: string; lastSeen: Date; callIds: Set<string> }
  >();
  for (const r of rows) {
    const key = slugifyThemeLabel(r.label);
    if (!key) continue; // unsluggable label (all punctuation) — skip.
    const g = groups.get(key);
    if (g) {
      g.callIds.add(r.callId);
      if (r.callDate > g.lastSeen) {
        g.lastSeen = r.callDate;
        g.label = r.label;
      }
    } else {
      groups.set(key, {
        label: r.label,
        lastSeen: r.callDate,
        callIds: new Set([r.callId]),
      });
    }
  }

  const items: WorkspaceThemeItem[] = [...groups.entries()].map(([key, g]) => ({
    key,
    label: g.label,
    callCount: g.callIds.size,
    lastSeen: g.lastSeen,
  }));
  // Map insertion follows newest-first row order, so items are already sorted by
  // last-seen desc; sort explicitly to be resilient to future row-order changes.
  items.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  return items.slice(0, limit);
}

/**
 * The evidence a timeline row expands into: that one call's themed_doc theme
 * matching `key` (verbatim notes + resolved quotes + flags + any AI bullets).
 * Thin read — pulls only themed_doc and returns the matching theme or null.
 */
export async function getThemeDetail(opts: {
  workspaceId: string;
  callId: string;
  key: string;
}): Promise<ThemedDocTheme | null> {
  const [row] = await db
    .select({ themedDoc: callRecordings.themedDoc })
    .from(callRecordings)
    .where(
      and(
        eq(callRecordings.id, opts.callId),
        eq(callRecordings.workspaceId, opts.workspaceId),
      ),
    )
    .limit(1);

  const doc = row?.themedDoc as ThemedDoc | null | undefined;
  if (!doc || !Array.isArray(doc.themes)) return null;
  return doc.themes.find((t) => t.key === opts.key) ?? null;
}
