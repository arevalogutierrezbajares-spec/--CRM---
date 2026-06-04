/**
 * Unit tests for the @/# mention trigger detection + token splice that back the
 * keyboard mention combobox.
 */
import { describe, it, expect } from "vitest";
import { detectTrigger, spliceToken } from "@/lib/nlp/mention-trigger";

describe("detectTrigger", () => {
  it("detects an @ at the start", () => {
    expect(detectTrigger("@bob", 4)).toEqual({ kind: "@", query: "bob", start: 0 });
  });

  it("detects an @ after whitespace and reports the trigger index", () => {
    // "hello @an" — caret at end (8); @ is at index 6
    expect(detectTrigger("hello @an", 9)).toEqual({ kind: "@", query: "an", start: 6 });
  });

  it("detects a # project trigger", () => {
    expect(detectTrigger("ship #acme", 10)).toEqual({ kind: "#", query: "acme", start: 5 });
  });

  it("returns null when there is no trigger", () => {
    expect(detectTrigger("just some text", 14)).toBeNull();
  });

  it("does NOT trigger on an email's @ (no whitespace before it)", () => {
    expect(detectTrigger("mail a@b.com", 7)).toBeNull();
  });

  it("matches accented names (unicode)", () => {
    expect(detectTrigger("ping @josé", 10)).toEqual({ kind: "@", query: "josé", start: 5 });
  });

  it("uses the caret, not the end of the string", () => {
    // caret right after "@an" (index 6) in "hi @an more"
    expect(detectTrigger("hi @an more", 6)).toEqual({ kind: "@", query: "an", start: 3 });
  });

  it("handles a bare trigger char with empty query", () => {
    expect(detectTrigger("note @", 6)).toEqual({ kind: "@", query: "", start: 5 });
  });
});

describe("spliceToken", () => {
  it("replaces the in-progress trigger with the token + trailing space", () => {
    // "call @an" → pick @AnaReyes ; start=5, caret=8
    const r = spliceToken("call @an", 5, 8, "@AnaReyes");
    expect(r.next).toBe("call @AnaReyes ");
    expect(r.caret).toBe("call @AnaReyes ".length);
  });

  it("preserves text after the caret", () => {
    const r = spliceToken("call @an tomorrow", 5, 8, "@AnaReyes");
    expect(r.next).toBe("call @AnaReyes  tomorrow");
    // caret sits right after the inserted token + its space
    expect(r.next.slice(0, r.caret)).toBe("call @AnaReyes ");
  });

  it("splices a # project token", () => {
    const r = spliceToken("ship #ac", 5, 8, "#Acme launch");
    expect(r.next).toBe("ship #Acme launch ");
  });
});
