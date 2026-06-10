import { describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGETS,
  LAYOUT_VERSION,
  packLayout,
  readLayout,
  resolveLayout,
} from "@/lib/dashboard/layout";

describe("dashboard layout", () => {
  it("v5 no longer includes the tasks widget (it renders fixed above the grid)", () => {
    expect(LAYOUT_VERSION).toBe(5);
    expect(DEFAULT_WIDGETS.some((w) => w.id === "tasks")).toBe(false);
  });

  it("readLayout discards an out-of-date stored version and re-seeds defaults", () => {
    const storedV4 = {
      v: 4,
      widgets: [
        { id: "tasks", hidden: false, size: "full" },
        { id: "town_hall", hidden: true, size: "full" },
      ],
    };
    expect(readLayout(storedV4)).toEqual(DEFAULT_WIDGETS);
  });

  it("readLayout honors a current-version layout but drops unknown ids", () => {
    const stored = {
      v: LAYOUT_VERSION,
      widgets: [
        { id: "scorecard", hidden: false, size: "full" },
        { id: "tasks", hidden: false, size: "full" }, // stale id from v4
      ],
    };
    const out = readLayout(stored);
    expect(out[0].id).toBe("scorecard");
    expect(out.some((w) => w.id === "tasks")).toBe(false);
    // widgets added in later releases are appended
    for (const d of DEFAULT_WIDGETS) {
      expect(out.some((w) => w.id === d.id)).toBe(true);
    }
  });

  it("packLayout stamps the current version and sanitizes", () => {
    const packed = packLayout([{ id: "ai", hidden: true, size: "full" }]);
    expect(packed.v).toBe(LAYOUT_VERSION);
    expect(packed.widgets[0]).toEqual({ id: "ai", hidden: true, size: "full" });
  });

  it("resolveLayout tolerates malformed input", () => {
    expect(resolveLayout("garbage")).toEqual(DEFAULT_WIDGETS);
    expect(resolveLayout([{ nope: 1 }, null])).toEqual(DEFAULT_WIDGETS);
  });
});
