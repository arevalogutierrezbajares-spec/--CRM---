import { describe, it, expect } from "vitest";
import { listReducer } from "@/lib/use-optimistic-list";

type Row = { id: string; title: string; done?: boolean };
const rows: Row[] = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
];

describe("listReducer", () => {
  it("removes by id", () => {
    expect(listReducer(rows, { kind: "remove", id: "a" })).toEqual([{ id: "b", title: "B" }]);
  });

  it("remove is a no-op for an unknown id", () => {
    expect(listReducer(rows, { kind: "remove", id: "z" })).toHaveLength(2);
  });

  it("appends by default", () => {
    const r = listReducer(rows, { kind: "add", item: { id: "c", title: "C" } });
    expect(r.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("prepends when asked", () => {
    const r = listReducer(rows, { kind: "add", item: { id: "c", title: "C" }, prepend: true });
    expect(r.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("patches a field by id without mutating the input", () => {
    const r = listReducer(rows, { kind: "patch", id: "a", patch: { done: true } });
    expect(r.find((x) => x.id === "a")).toEqual({ id: "a", title: "A", done: true });
    expect(rows[0].done).toBeUndefined(); // original untouched
  });
});
