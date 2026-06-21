/**
 * THE BRAIN — freshness gate (Concern 2). Locks the pure drift/age logic that
 * decides whether the generated artifact has gone stale vs the live repos.
 */

import { describe, it, expect } from "vitest";
import {
  diffCommits,
  ageDays,
} from "@/scripts/brain/check-staleness.mjs";

describe("diffCommits", () => {
  it("flags repos whose live SHA moved past the recorded one", () => {
    const drift = diffCommits(
      { vav: "aaaa", caney: "bbbb", crm: "cccc" },
      { vav: "aaaa", caney: "b999", crm: "cccc" },
    );
    expect(drift).toEqual([{ system: "caney", recorded: "bbbb", current: "b999" }]);
  });

  it("returns no drift when every checked repo matches", () => {
    expect(diffCommits({ vav: "a", crm: "c" }, { vav: "a", crm: "c" })).toEqual([]);
  });

  it("skips repos with no live SHA (not checked out)", () => {
    // caney absent from `current` → undefined → skipped, not a false drift.
    expect(diffCommits({ vav: "a", caney: "b" }, { vav: "a" })).toEqual([]);
    expect(diffCommits({ vav: "a", caney: "b" }, { vav: "a", caney: null })).toEqual([]);
  });

  it("skips systems with a null recorded SHA (no code yet, e.g. academy)", () => {
    expect(diffCommits({ academy: null }, { academy: "abcd" })).toEqual([]);
  });

  it("reports multiple drifted repos", () => {
    const drift = diffCommits(
      { vav: "1", caney: "2" },
      { vav: "1x", caney: "2x" },
    );
    expect(drift.map((d) => d.system).sort()).toEqual(["caney", "vav"]);
  });
});

describe("ageDays", () => {
  const base = Date.parse("2026-06-21T00:00:00.000Z");

  it("computes whole elapsed days", () => {
    expect(ageDays("2026-06-21T00:00:00.000Z", base)).toBe(0);
    expect(ageDays("2026-06-14T00:00:00.000Z", base)).toBe(7);
    expect(ageDays("2026-06-20T12:00:00.000Z", base)).toBe(0); // 12h → floor 0
  });

  it("returns null for an unparseable timestamp", () => {
    expect(ageDays("not-a-date", base)).toBeNull();
    expect(ageDays(undefined, base)).toBeNull();
  });
});
