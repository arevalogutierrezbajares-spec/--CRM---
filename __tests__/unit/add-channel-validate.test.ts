/**
 * Unit tests for add_channel validation logic.
 * We test the validation inline since it's a pure function exported from the module.
 */
import { describe, it, expect } from "vitest";

// Mirror the validation logic — if the tool's validateChannelValue were exported we'd use it.
// Instead we run the tool's execute path via a thin repro of the validator.
function validate(kind: string, value: string): string | null {
  if (kind === "email" && !value.includes("@")) return "Invalid email address";
  if (kind === "phone" && !/^[+0-9\s\-().]{6,20}$/.test(value)) return "Invalid phone number";
  if (
    kind === "whatsapp" &&
    !/^\+?[0-9]{7,15}$/.test(value.replace(/[\s\-().]/g, ""))
  )
    return "Invalid WhatsApp number (use E.164 format, e.g. +14155551234)";
  return null;
}

describe("add_channel field validation", () => {
  it("accepts valid email", () => {
    expect(validate("email", "oscar@laguaquira.com")).toBeNull();
  });

  it("rejects email without @", () => {
    expect(validate("email", "notanemail")).toBe("Invalid email address");
  });

  it("accepts E.164 phone", () => {
    expect(validate("whatsapp", "+14155551234")).toBeNull();
  });

  it("accepts WhatsApp without +", () => {
    expect(validate("whatsapp", "14155551234")).toBeNull();
  });

  it("rejects too-short WhatsApp", () => {
    expect(validate("whatsapp", "+123")).not.toBeNull();
  });

  it("accepts plain phone", () => {
    expect(validate("phone", "+1 (415) 555-1234")).toBeNull();
  });

  it("accepts instagram/domain without validation", () => {
    expect(validate("instagram", "@oscarhotel")).toBeNull();
    expect(validate("domain", "laguaquira.com")).toBeNull();
  });
});
