/**
 * Unit tests for natural-language quick-capture (lib/nlp/parse-capture.ts).
 * Locks in the fix where input made entirely of @/#/date tokens used to
 * re-inject those tokens as a junk title; it must now yield an empty title so
 * the caller rejects it with "Nothing to capture."
 */
import { describe, it, expect } from "vitest";
import { parseCapture } from "@/lib/nlp/parse-capture";

describe("parseCapture", () => {
  it("extracts title, assignee, project and priority from a full capture", () => {
    const r = parseCapture("call Ana tomorrow 3pm @ana #acme urgent");
    expect(r.title).toBe("call Ana");
    expect(r.assigneeName).toBe("ana");
    expect(r.projectName).toBe("acme");
    expect(r.priority).toBe("now");
    expect(r.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns an EMPTY title when input is only tokens (the fix)", () => {
    const r = parseCapture("@bob #proj");
    expect(r.title).toBe(""); // never the raw "@bob #proj"
    expect(r.assigneeName).toBe("bob");
    expect(r.projectName).toBe("proj");
  });

  it("returns an empty title for whitespace-padded token-only input", () => {
    const r = parseCapture("   @bob    #proj   ");
    expect(r.title).toBe("");
  });

  it("keeps a plain title untouched", () => {
    const r = parseCapture("buy milk");
    expect(r.title).toBe("buy milk");
    expect(r.assigneeName).toBeNull();
    expect(r.projectName).toBeNull();
    expect(r.dueDate).toBeNull();
  });

  it("strips a trailing project ref from the title", () => {
    const r = parseCapture("review #q4-plan");
    expect(r.title).toBe("review");
    expect(r.projectName).toBe("q4-plan");
  });

  it("takes the first @handle when several are present", () => {
    const r = parseCapture("sync @ana @bob");
    expect(r.assigneeName).toBe("ana");
    expect(r.title).toBe("sync");
  });

  it("handles accented handles", () => {
    const r = parseCapture("ping @josé about the deck");
    expect(r.assigneeName).toBe("josé");
    expect(r.title).toBe("ping about the deck");
  });

  it("does not treat an email as an assignee handle", () => {
    const r = parseCapture("email client@example.com the invoice");
    expect(r.assigneeName).toBeNull(); // no whitespace/start before @
    expect(r.title).toContain("invoice");
  });
});
