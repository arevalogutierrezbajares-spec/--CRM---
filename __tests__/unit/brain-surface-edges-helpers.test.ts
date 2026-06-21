/**
 * Unit coverage for the surface-edges extractor's PURE helpers (the critique
 * flagged them as untested). These are the signature-matching + classification
 * primitives every emitted micro-edge depends on.
 */

import { describe, it, expect } from "vitest";
import {
  wordBoundaryMatch,
  accessFor,
  snakeToCamel,
  canonicalRoute,
} from "@/scripts/brain/extractors/surface-edges.mjs";

describe("wordBoundaryMatch", () => {
  it("matches a table identifier on boundaries", () => {
    expect(wordBoundaryMatch("db.insert(quotes)", "quotes")).toBe(true);
    expect(wordBoundaryMatch(".from('pms_holds')", "pms_holds")).toBe(true);
  });
  it("rejects coincidental substrings", () => {
    expect(wordBoundaryMatch("quotest", "quotes")).toBe(false);
    expect(wordBoundaryMatch("xquotes", "quotes")).toBe(false);
  });
});

describe("accessFor (read vs write direction)", () => {
  it("writes when a write op sits near the token", () => {
    expect(accessFor("await db.insert(pmsHolds).values(x)", ["pmsHolds"])).toBe("writes");
    expect(accessFor("session.add(Booking(...)) ; session.commit()", ["Booking"])).toBe("writes");
  });
  it("reads when only a select/read appears", () => {
    expect(accessFor("const r = await db.select().from(guestBookings)", ["guestBookings"])).toBe("reads");
  });
  it("defaults to reads when the token is absent", () => {
    expect(accessFor("unrelated code", ["quotes"])).toBe("reads");
  });
});

describe("snakeToCamel", () => {
  it("converts snake table names to the Drizzle binding", () => {
    expect(snakeToCamel("research_notes")).toBe("researchNotes");
    expect(snakeToCamel("contacts")).toBe("contacts");
    expect(snakeToCamel("accounting_journal_entries")).toBe("accountingJournalEntries");
  });
});

describe("canonicalRoute", () => {
  it("normalizes OpenAPI {param} and App-Router [param] to the same key", () => {
    expect(canonicalRoute("/api/listings/{slug}/availability")).toBe(
      canonicalRoute("/api/listings/[slug]/availability"),
    );
    expect(canonicalRoute("/api/holds")).toBe("/api/holds");
  });
});
