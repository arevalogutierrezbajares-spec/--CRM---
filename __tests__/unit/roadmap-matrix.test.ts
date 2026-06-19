import { describe, it, expect } from "vitest";
import {
  buildRoadmapMatrix,
  UNASSIGNED_LOB,
  type MatrixFunction,
  type MatrixInitiative,
  type MatrixLob,
} from "@/lib/roadmap-matrix";

const fns: MatrixFunction[] = [
  { id: "f-prod", name: "Product", slug: "product", sortOrder: 0, color: null, archived: false },
  { id: "f-eng", name: "Engineering", slug: "engineering", sortOrder: 1, color: null, archived: false },
  { id: "f-unc", name: "Uncategorized", slug: "uncategorized", sortOrder: 99, color: null, archived: false },
];
const lobs: MatrixLob[] = [
  { id: "l-caney", title: "CaneyCloud" },
  { id: "l-vav", title: "VAV" },
];

function init(over: Partial<MatrixInitiative>): MatrixInitiative {
  return {
    id: "i1", title: "X", status: "active", healthColor: "green",
    lobId: "l-caney", functionId: "f-prod", ownerUserId: null, people: [],
    ...over,
  };
}

describe("buildRoadmapMatrix", () => {
  it("places an initiative in exactly one (function, lob) cell", () => {
    const m = buildRoadmapMatrix(fns, lobs, [init({ id: "a", functionId: "f-eng", lobId: "l-vav" })]);
    const engRow = m.rows.find((r) => r.fn?.id === "f-eng")!;
    const vavCell = engRow.cells.find((c) => c.columnKey === "l-vav")!;
    expect(vavCell.items.map((i) => i.id)).toEqual(["a"]);
    // and nowhere else
    const placed = m.rows.flatMap((r) => r.cells.flatMap((c) => c.items.map((i) => i.id)));
    expect(placed.filter((id) => id === "a")).toHaveLength(1);
  });

  it("orders function rows by sortOrder (Uncategorized last) and LoB columns as given", () => {
    const m = buildRoadmapMatrix(fns, lobs, []);
    expect(m.rows.map((r) => r.fn?.slug)).toEqual(["product", "engineering", "uncategorized"]);
    expect(m.columns.filter((c) => !c.isUnassigned).map((c) => c.lobId)).toEqual(["l-caney", "l-vav"]);
  });

  it("routes a null function_id into the Uncategorized row and counts it as an orphan", () => {
    const m = buildRoadmapMatrix(fns, lobs, [init({ id: "o", functionId: null })]);
    const uncRow = m.rows.find((r) => r.isUncategorized)!;
    expect(uncRow.total).toBe(1);
    expect(m.orphanFunctionCount).toBe(1);
  });

  it("adds an Unassigned column only when a null-lob initiative exists, and counts it", () => {
    const none = buildRoadmapMatrix(fns, lobs, [init({ lobId: "l-caney" })]);
    expect(none.columns.some((c) => c.isUnassigned)).toBe(false);

    const m = buildRoadmapMatrix(fns, lobs, [init({ id: "u", lobId: null })]);
    const col = m.columns.find((c) => c.isUnassigned)!;
    expect(col.key).toBe(UNASSIGNED_LOB);
    expect(m.orphanLobCount).toBe(1);
    const prodRow = m.rows.find((r) => r.fn?.id === "f-prod")!;
    expect(prodRow.cells.find((c) => c.columnKey === UNASSIGNED_LOB)!.items.map((i) => i.id)).toEqual(["u"]);
  });

  it("filters by function, lob, status and person", () => {
    const items = [
      init({ id: "a", functionId: "f-prod", lobId: "l-caney", status: "active", people: [{ userId: "u1", displayName: "A" }] }),
      init({ id: "b", functionId: "f-eng", lobId: "l-vav", status: "done", ownerUserId: "u2" }),
    ];
    expect(buildRoadmapMatrix(fns, lobs, items, { functionId: "f-eng" }).total).toBe(1);
    expect(buildRoadmapMatrix(fns, lobs, items, { lobId: "l-caney" }).total).toBe(1);
    expect(buildRoadmapMatrix(fns, lobs, items, { status: "done" }).total).toBe(1);
    expect(buildRoadmapMatrix(fns, lobs, items, { personId: "u1" }).total).toBe(1);
    expect(buildRoadmapMatrix(fns, lobs, items, { personId: "u2" }).total).toBe(1); // owner counts
  });

  it("treats a dangling function_id (not in the function list) as Uncategorized", () => {
    const m = buildRoadmapMatrix(fns, lobs, [init({ id: "d", functionId: "ghost" })]);
    expect(m.rows.find((r) => r.isUncategorized)!.total).toBe(1);
    expect(m.orphanFunctionCount).toBe(1);
  });

  it("routes an initiative on an archived function into Uncategorized (never dropped)", () => {
    const withArchived: MatrixFunction[] = [
      ...fns,
      { id: "f-old", name: "Legacy", slug: "legacy", sortOrder: 5, color: null, archived: true },
    ];
    const m = buildRoadmapMatrix(withArchived, lobs, [init({ id: "x", functionId: "f-old" })]);
    expect(m.rows.some((r) => r.fn?.id === "f-old")).toBe(false); // archived = no row
    expect(m.rows.find((r) => r.isUncategorized)!.total).toBe(1); // rehomed
    const placed = m.rows.flatMap((r) => r.cells.flatMap((c) => c.items));
    expect(placed).toHaveLength(1);
  });

  it("never loses an initiative: total equals the input count", () => {
    const items = [
      init({ id: "a", functionId: null, lobId: null }),
      init({ id: "b", functionId: "f-prod", lobId: "l-vav" }),
      init({ id: "c", functionId: "ghost", lobId: "l-caney" }),
    ];
    const m = buildRoadmapMatrix(fns, lobs, items);
    const placed = m.rows.flatMap((r) => r.cells.flatMap((c) => c.items));
    expect(placed).toHaveLength(3);
    expect(m.total).toBe(3);
  });
});
