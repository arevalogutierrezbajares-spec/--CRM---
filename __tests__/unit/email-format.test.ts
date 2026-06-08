import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, previewText, splitEmails } from "@/lib/email/format";

describe("email formatting helpers", () => {
  it("normalizes mailbox addresses", () => {
    expect(normalizeEmail("  Tomas@CaneyCloud.COM ")).toBe("tomas@caneycloud.com");
  });

  it("splits comma, semicolon, and newline recipient lists", () => {
    expect(splitEmails("a@example.com, b@example.com\nc@example.com; d@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
      "d@example.com",
    ]);
  });

  it("validates common email address shape", () => {
    expect(isValidEmail("sales@caneycloud.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("compacts previews without exceeding the requested length", () => {
    const text = previewText("hello\n\nthere ".repeat(20), 40);
    expect(text.length).toBeLessThanOrEqual(40);
    expect(text).not.toContain("\n");
  });
});
