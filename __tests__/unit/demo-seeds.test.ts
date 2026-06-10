import { describe, expect, test } from "vitest";
import { CANEY_DEMO_SEEDS } from "@/lib/platforms/demo-seeds";

// The ?guia= ids are a contract with CaneyCloud's guide registry
// (--TOURISM-- APP/frontend/lib/guides/registry.ts). If a guide is renamed
// there, this list must follow or the seeded demo links 404 into a blank
// tour. Update both sides together.
const KNOWN_GUIDE_IDS = [
  "demo-rapido",
  "demo-completo",
  "entrenamiento-maestro",
  "entrenamiento-recepcion",
  "entrenamiento-finanzas",
];

describe("CaneyCloud demo seed catalog", () => {
  test("every seed is a caneycloud https deep link with access guidance", () => {
    for (const seed of CANEY_DEMO_SEEDS) {
      expect(seed.platformId).toBe("caneycloud");
      expect(seed.url).toMatch(/^https?:\/\//);
      expect(seed.label.length).toBeGreaterThan(0);
      // Each entry must tell the viewer how to get in (credentials or notes).
      expect(seed.username || seed.accessNotes).toBeTruthy();
    }
  });

  test("seeds cover exactly the known guided tours, one each", () => {
    const ids = CANEY_DEMO_SEEDS.map(
      (seed) => new URL(seed.url).searchParams.get("guia"),
    );
    expect(ids).toEqual(KNOWN_GUIDE_IDS);
  });

  test("sort order is stable and unique", () => {
    const orders = CANEY_DEMO_SEEDS.map((s) => s.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});
