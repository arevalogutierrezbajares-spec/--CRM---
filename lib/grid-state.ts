/**
 * URL-stateful grid helpers. Sort/filter/group encoded as compact query params.
 *
 *   ?sort=name:asc,lastTouch:desc
 *   ?filter=relationship=lead;tag=caney
 *   ?group=relationship
 */

export type SortDir = "asc" | "desc";
export type SortEntry = { col: string; dir: SortDir };

export function parseSort(raw: string | undefined | null): SortEntry[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [col, dir] = p.split(":");
      return {
        col: col.trim(),
        dir: dir?.trim().toLowerCase() === "desc" ? "desc" : "asc",
      } as SortEntry;
    });
}

export function stringifySort(entries: SortEntry[]): string {
  return entries.map((e) => `${e.col}:${e.dir}`).join(",");
}

export type Filters = Record<string, string>;

export function parseFilter(raw: string | undefined | null): Filters {
  if (!raw) return {};
  const out: Filters = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key && val) out[key] = val;
  }
  return out;
}

export function stringifyFilter(filters: Filters): string {
  return Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join(";");
}

export function toggleSort(
  current: SortEntry[],
  col: string,
): SortEntry[] {
  const existing = current.find((s) => s.col === col);
  if (!existing) return [{ col, dir: "asc" }];
  if (existing.dir === "asc") return [{ col, dir: "desc" }];
  return [];
}

export function buildHref(
  basePath: string,
  current: URLSearchParams,
  updates: Partial<{
    sort: SortEntry[];
    filters: Filters;
    group: string | null;
  }>,
): string {
  const next = new URLSearchParams(current);
  if (updates.sort !== undefined) {
    const s = stringifySort(updates.sort);
    if (s) next.set("sort", s);
    else next.delete("sort");
  }
  if (updates.filters !== undefined) {
    const f = stringifyFilter(updates.filters);
    if (f) next.set("filter", f);
    else next.delete("filter");
  }
  if (updates.group !== undefined) {
    if (updates.group) next.set("group", updates.group);
    else next.delete("group");
  }
  const q = next.toString();
  return q ? `${basePath}?${q}` : basePath;
}

/** Generic in-memory sorter; pass an accessor per column. */
export function applySort<T>(
  rows: T[],
  sort: SortEntry[],
  accessors: Record<string, (row: T) => string | number | Date | null | undefined>,
): T[] {
  if (sort.length === 0) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const s of sort) {
      const accessor = accessors[s.col];
      if (!accessor) continue;
      const av = accessor(a);
      const bv = accessor(b);
      // Nulls always sort last, regardless of asc/desc direction.
      if (av == null && bv == null) continue;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = compareDefined(av, bv);
      if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return sorted;
}

function compareDefined(
  a: string | number | Date,
  b: string | number | Date,
): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function applyFilters<T>(
  rows: T[],
  filters: Filters,
  predicates: Record<string, (row: T, value: string) => boolean>,
): T[] {
  let out = rows;
  for (const [col, value] of Object.entries(filters)) {
    const p = predicates[col];
    if (!p) continue;
    out = out.filter((r) => p(r, value));
  }
  return out;
}

export function groupBy<T>(
  rows: T[],
  group: string | undefined,
  accessor: (row: T) => string,
): Map<string, T[]> {
  if (!group) return new Map([["", rows]]);
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const k = accessor(r) || "—";
    const bucket = out.get(k);
    if (bucket) bucket.push(r);
    else out.set(k, [r]);
  }
  return out;
}
