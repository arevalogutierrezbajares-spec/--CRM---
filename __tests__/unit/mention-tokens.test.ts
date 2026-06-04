/**
 * Tokens are whitespace-stripped so multi-word names/projects/docs round-trip
 * (no "Revenue Push" tail leaking into titles) and so pick-reconciliation can
 * tell whether a token is still in the body.
 */
import { describe, it, expect } from "vitest";
import { personToken, refToken, personInBody, refInBody } from "@/lib/nlp/mention-tokens";

describe("mention tokens", () => {
  it("despaces a multi-word person token", () => {
    expect(personToken("Ana Reyes")).toBe("@AnaReyes");
  });

  it("despaces a multi-word project/doc token", () => {
    expect(refToken("#", "Q3 Revenue Push")).toBe("#Q3RevenuePush");
    expect(refToken("@", "Pitch Deck v2")).toBe("@PitchDeckv2");
  });

  it("detects a person token present in the body (case-insensitive)", () => {
    expect(personInBody("ping @anareyes about pricing", "Ana Reyes")).toBe(true);
    expect(personInBody("ping someone else", "Ana Reyes")).toBe(false);
  });

  it("detects a ref token present in the body", () => {
    expect(refInBody("ship #q3revenuepush this week", "#", "Q3 Revenue Push")).toBe(true);
    expect(refInBody("ship the thing", "#", "Q3 Revenue Push")).toBe(false);
  });

  it("reconciliation drops a pick whose token was deleted", () => {
    // simulate: picked Ana, then deleted her token → personInBody is false
    const body = "call about pricing"; // no @anareyes
    expect(personInBody(body, "Ana Reyes")).toBe(false);
  });
});
