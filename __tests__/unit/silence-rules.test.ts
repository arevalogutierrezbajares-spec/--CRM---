import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brainKillSwitch, inQuietHours } from "@/lib/silence-rules";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("silence-rules · brainKillSwitch", () => {
  beforeEach(() => {
    delete process.env.AGB_BRAIN_DISABLED;
  });

  it("returns false by default", () => {
    expect(brainKillSwitch()).toBe(false);
  });

  it("returns true when AGB_BRAIN_DISABLED=1", () => {
    process.env.AGB_BRAIN_DISABLED = "1";
    expect(brainKillSwitch()).toBe(true);
  });
});

describe("silence-rules · inQuietHours", () => {
  beforeEach(() => {
    delete process.env.AGB_BRAIN_QUIET_HOURS;
    delete process.env.AGB_BRAIN_QUIET_HOURS_TZ;
  });

  it("returns false when no range configured", () => {
    expect(inQuietHours(new Date("2026-05-26T14:00:00Z"))).toBe(false);
  });

  it("handles non-wrapping ranges (9-17 = work hours)", () => {
    process.env.AGB_BRAIN_QUIET_HOURS = "9-17";
    process.env.AGB_BRAIN_QUIET_HOURS_TZ = "UTC";
    expect(inQuietHours(new Date("2026-05-26T10:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-05-26T20:00:00Z"))).toBe(false);
  });

  it("handles wrapping ranges (22-7 = overnight)", () => {
    process.env.AGB_BRAIN_QUIET_HOURS = "22-7";
    process.env.AGB_BRAIN_QUIET_HOURS_TZ = "UTC";
    expect(inQuietHours(new Date("2026-05-26T23:30:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-05-26T03:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-05-26T12:00:00Z"))).toBe(false);
  });

  it("ignores malformed AGB_BRAIN_QUIET_HOURS", () => {
    process.env.AGB_BRAIN_QUIET_HOURS = "not-a-range";
    expect(inQuietHours(new Date())).toBe(false);
  });
});
