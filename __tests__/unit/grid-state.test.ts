import { describe, expect, it } from "vitest";
import {
  parseSort,
  stringifySort,
  parseFilter,
  stringifyFilter,
  toggleSort,
  applySort,
  applyFilters,
  groupBy,
  buildHref,
} from "@/lib/grid-state";

describe("grid-state", () => {
  it("parses and stringifies sort entries", () => {
    const sort = parseSort("name:asc,lastTouch:desc");
    expect(sort).toEqual([
      { col: "name", dir: "asc" },
      { col: "lastTouch", dir: "desc" },
    ]);
    expect(stringifySort(sort)).toBe("name:asc,lastTouch:desc");
  });

  it("parses empty sort gracefully", () => {
    expect(parseSort(undefined)).toEqual([]);
    expect(parseSort("")).toEqual([]);
  });

  it("toggles sort cycle: none → asc → desc → none", () => {
    const a = toggleSort([], "name");
    expect(a).toEqual([{ col: "name", dir: "asc" }]);
    const b = toggleSort(a, "name");
    expect(b).toEqual([{ col: "name", dir: "desc" }]);
    const c = toggleSort(b, "name");
    expect(c).toEqual([]);
  });

  it("parses and stringifies filters", () => {
    const filters = parseFilter("relationship=lead;tag=caney");
    expect(filters).toEqual({ relationship: "lead", tag: "caney" });
    expect(stringifyFilter(filters)).toBe("relationship=lead;tag=caney");
  });

  it("ignores empty filter values when stringifying", () => {
    expect(stringifyFilter({ a: "1", b: "" })).toBe("a=1");
  });

  it("applies sort using accessors", () => {
    type Row = { name: string; age: number };
    const rows: Row[] = [
      { name: "Carlos", age: 30 },
      { name: "Ana", age: 45 },
      { name: "Bob", age: 30 },
    ];
    const sorted = applySort(rows, [{ col: "name", dir: "asc" }], {
      name: (r) => r.name.toLowerCase(),
    });
    expect(sorted.map((r) => r.name)).toEqual(["Ana", "Bob", "Carlos"]);
  });

  it("sorts nulls last regardless of direction", () => {
    type Row = { v: number | null };
    const rows: Row[] = [{ v: 1 }, { v: null }, { v: 3 }];
    const asc = applySort(rows, [{ col: "v", dir: "asc" }], {
      v: (r) => r.v,
    });
    expect(asc.map((r) => r.v)).toEqual([1, 3, null]);
    const desc = applySort(rows, [{ col: "v", dir: "desc" }], {
      v: (r) => r.v,
    });
    expect(desc.map((r) => r.v)).toEqual([3, 1, null]);
  });

  it("applies filters using predicates", () => {
    type Row = { rel: string };
    const rows: Row[] = [{ rel: "friend" }, { rel: "lead" }, { rel: "friend" }];
    const filtered = applyFilters(
      rows,
      { rel: "friend" },
      { rel: (r, v) => r.rel === v },
    );
    expect(filtered).toEqual([{ rel: "friend" }, { rel: "friend" }]);
  });

  it("groups rows by accessor key", () => {
    const rows = [
      { id: 1, kind: "a" },
      { id: 2, kind: "b" },
      { id: 3, kind: "a" },
    ];
    const groups = groupBy(rows, "kind", (r) => r.kind);
    expect(groups.get("a")?.length).toBe(2);
    expect(groups.get("b")?.length).toBe(1);
  });

  it("does not group when group is undefined", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const groups = groupBy(rows, undefined, () => "");
    expect(groups.size).toBe(1);
    expect(groups.get("")?.length).toBe(2);
  });

  it("buildHref drops query when sort + filter + group all empty", () => {
    const href = buildHref("/contacts", new URLSearchParams(), {
      sort: [],
      filters: {},
      group: null,
    });
    expect(href).toBe("/contacts");
  });

  it("buildHref preserves existing params not touched by updates", () => {
    const href = buildHref(
      "/contacts",
      new URLSearchParams("archived=true"),
      {
        sort: [{ col: "name", dir: "asc" }],
      },
    );
    expect(href).toBe("/contacts?archived=true&sort=name%3Aasc");
  });

  it("round-trips comma-list filter values (multi-select)", () => {
    const filters = parseFilter("relationship=friend,lead;project=a,b");
    expect(filters).toEqual({ relationship: "friend,lead", project: "a,b" });
    expect(stringifyFilter(filters)).toBe("relationship=friend,lead;project=a,b");
  });

  it("applyFilters supports set-membership predicates over comma lists", () => {
    const rows = [
      { id: 1, rel: "friend" },
      { id: 2, rel: "prospect" },
      { id: 3, rel: "lead" },
    ];
    const out = applyFilters(rows, { rel: "friend,lead" }, {
      rel: (r, v) => v.split(",").includes(r.rel),
    });
    expect(out.map((r) => r.id)).toEqual([1, 3]);
  });
});
