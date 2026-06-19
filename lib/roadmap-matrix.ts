/**
 * FR-E6: pure grouping for the roadmap "by Project / Line-of-Business" matrix.
 * No React / no DB — the view and unit tests both call this.
 *
 * Rows  = functions (HORIZONTALS): Product, Engineering, … + reserved Uncategorized.
 * Cols  = LoBs (VERTICALS) + a reserved Unassigned column for null lob_id.
 * Cell  = the initiatives whose (functionId, lobId) land on that intersection.
 *
 * "No orphans": the reserved Uncategorized function row and Unassigned LoB column
 * catch every initiative missing a real axis, so nothing is ever invisible.
 */

export const UNCATEGORIZED_SLUG = "uncategorized";
/** Sentinel column key for initiatives with a null lob_id. */
export const UNASSIGNED_LOB = "__unassigned_lob__";

export type MatrixInitiative = {
  id: string;
  title: string;
  status: string;
  healthColor: string;
  lobId: string | null;
  functionId: string | null;
  ownerUserId: string | null;
  people: Array<{ userId: string; displayName: string }>;
};

export type MatrixFunction = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  color: string | null;
  archived: boolean;
};

export type MatrixLob = { id: string; title: string };

export type MatrixColumn = { key: string; lobId: string | null; title: string; isUnassigned: boolean };
export type MatrixCell = { columnKey: string; items: MatrixInitiative[] };
export type MatrixRow = {
  fn: MatrixFunction | null; // null = the synthetic Uncategorized row when no fn row exists
  key: string;
  name: string;
  isUncategorized: boolean;
  cells: MatrixCell[];
  total: number;
};

export type Matrix = {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  /** Initiatives sitting in the reserved buckets — the operator's fix-me queue. */
  orphanFunctionCount: number;
  orphanLobCount: number;
  total: number;
};

export type MatrixFilter = {
  functionId?: string | null;
  /** A real lob id, the UNASSIGNED_LOB sentinel, or null/undefined for all. */
  lobId?: string | null;
  status?: string | null;
  personId?: string | null;
};

function columnKeyFor(lobId: string | null): string {
  return lobId ?? UNASSIGNED_LOB;
}

export function buildRoadmapMatrix(
  functions: MatrixFunction[],
  lobs: MatrixLob[],
  initiatives: MatrixInitiative[],
  filter: MatrixFilter = {},
): Matrix {
  const uncategorized = functions.find((f) => f.slug === UNCATEGORIZED_SLUG) ?? null;
  // Only functions that get a visible row can hold initiatives; archived
  // (non-uncategorized) ones don't, so their items fall back to Uncategorized
  // instead of vanishing from the grid.
  const displayableFnIds = new Set(
    functions.filter((f) => !f.archived || f.slug === UNCATEGORIZED_SLUG).map((f) => f.id),
  );

  // Resolve every initiative onto a function key (real id, or the uncategorized
  // bucket when its function_id is null / dangling / archived).
  const resolveFnKey = (i: MatrixInitiative): string => {
    if (i.functionId && displayableFnIds.has(i.functionId)) return i.functionId;
    return uncategorized?.id ?? UNCATEGORIZED_SLUG;
  };

  const matchesFilter = (i: MatrixInitiative): boolean => {
    if (filter.functionId && resolveFnKey(i) !== filter.functionId) return false;
    if (filter.lobId) {
      const colKey = columnKeyFor(i.lobId);
      if (colKey !== filter.lobId) return false;
    }
    if (filter.status && i.status !== filter.status) return false;
    if (filter.personId) {
      const tagged = i.ownerUserId === filter.personId || i.people.some((p) => p.userId === filter.personId);
      if (!tagged) return false;
    }
    return true;
  };

  const visible = initiatives.filter(matchesFilter);

  // Columns: every LoB in given order, plus an Unassigned column iff something
  // (orphan) needs it or the operator filtered to it.
  const hasUnassigned =
    visible.some((i) => i.lobId === null) || filter.lobId === UNASSIGNED_LOB;
  const columns: MatrixColumn[] = [
    ...lobs.map((l) => ({ key: l.id, lobId: l.id as string | null, title: l.title, isUnassigned: false })),
    ...(hasUnassigned
      ? [{ key: UNASSIGNED_LOB, lobId: null, title: "Unassigned", isUnassigned: true }]
      : []),
  ];

  // Rows: real functions (sorted, uncategorized last). Always include the
  // uncategorized row so its fix-me items are visible.
  const fnRows = [...functions]
    .filter((f) => !f.archived || f.slug === UNCATEGORIZED_SLUG)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const rowDefs: Array<{ key: string; fn: MatrixFunction | null; name: string; isUncategorized: boolean }> =
    fnRows.length > 0
      ? fnRows.map((f) => ({
          key: f.id,
          fn: f,
          name: f.name,
          isUncategorized: f.slug === UNCATEGORIZED_SLUG,
        }))
      : [{ key: UNCATEGORIZED_SLUG, fn: null, name: "Uncategorized", isUncategorized: true }];

  const rows: MatrixRow[] = rowDefs.map((rd) => {
    const inRow = visible.filter((i) => resolveFnKey(i) === rd.key);
    const cells: MatrixCell[] = columns.map((col) => ({
      columnKey: col.key,
      items: inRow.filter((i) => columnKeyFor(i.lobId) === col.key),
    }));
    return { ...rd, cells, total: inRow.length };
  });

  const uncategorizedKey = uncategorized?.id ?? UNCATEGORIZED_SLUG;
  const orphanFunctionCount = visible.filter((i) => resolveFnKey(i) === uncategorizedKey).length;
  const orphanLobCount = visible.filter((i) => i.lobId === null).length;

  return {
    rows,
    columns,
    orphanFunctionCount,
    orphanLobCount,
    total: visible.length,
  };
}
