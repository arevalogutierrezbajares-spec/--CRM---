/**
 * Unit tests for timezone-aware "today" math (lib/date/today.ts).
 * Locks in the fix for: a UTC-behind user (e.g. Venezuela, UTC-4) must not see
 * items due *today* flagged overdue in the evening, and snooze must add days in
 * the user's calendar, not UTC's.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { todayInTz, utcToday, addDaysToISODate } from "@/lib/date/today";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayInTz", () => {
  it("matches utcToday for the UTC zone", () => {
    expect(todayInTz("UTC")).toBe(utcToday());
  });

  it("returns the user's calendar date, not UTC's, in the evening (the bug)", () => {
    // 02:00 UTC on Jun 5 == 22:00 on Jun 4 in Caracas (UTC-4).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T02:00:00Z"));
    expect(utcToday()).toBe("2026-06-05");
    expect(todayInTz("America/Caracas")).toBe("2026-06-04"); // still "today" for the user
    expect(todayInTz("America/New_York")).toBe("2026-06-04"); // UTC-4 in June (DST)
  });

  it("agrees with UTC during the day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T15:00:00Z")); // 11:00 Caracas
    expect(todayInTz("America/Caracas")).toBe("2026-06-04");
    expect(utcToday()).toBe("2026-06-04");
  });

  it("emits YYYY-MM-DD format", () => {
    expect(todayInTz("America/Caracas")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to UTC date for an invalid timezone", () => {
    expect(todayInTz("Not/AZone")).toBe(utcToday());
  });
});

describe("addDaysToISODate", () => {
  it("adds a day", () => {
    expect(addDaysToISODate("2026-06-04", 1)).toBe("2026-06-05");
  });

  it("adds a week", () => {
    expect(addDaysToISODate("2026-06-04", 7)).toBe("2026-06-11");
  });

  it("rolls over a month boundary", () => {
    expect(addDaysToISODate("2026-02-28", 1)).toBe("2026-03-01"); // 2026 not a leap year
  });

  it("rolls over a year boundary", () => {
    expect(addDaysToISODate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysToISODate("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
  });

  it("is zone-independent (pure calendar math)", () => {
    // Should never drift regardless of the host's local offset.
    expect(addDaysToISODate("2026-06-04", 30)).toBe("2026-07-04");
  });
});
