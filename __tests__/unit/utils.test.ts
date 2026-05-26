import { describe, expect, it } from "vitest";
import { cn, formatDate, formatRelative, formatDateTime } from "@/lib/utils";

describe("cn", () => {
  it("merges class names + dedupes Tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", undefined, false && "skipped", "font-medium")).toBe(
      "text-sm font-medium",
    );
  });
});

describe("formatDate", () => {
  it("renders an em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("formats a date as 'Mon DD, YYYY'", () => {
    expect(formatDate(new Date("2026-05-26T12:00:00Z"))).toMatch(
      /May 2[56], 2026/,
    );
  });
});

describe("formatDateTime", () => {
  it("renders weekday + month + day + time", () => {
    const s = formatDateTime(new Date("2026-05-26T14:00:00Z"));
    expect(s).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · /);
    expect(s).toMatch(/(AM|PM)$/);
  });

  it("renders an em-dash for null/undefined", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = Date.now();

  it("returns 'never' for null", () => {
    expect(formatRelative(null)).toBe("never");
  });

  it("returns 'today' / 'yesterday'", () => {
    expect(formatRelative(new Date(now))).toBe("today");
    expect(formatRelative(new Date(now - 86400000))).toBe("yesterday");
  });

  it("uses day buckets under a week", () => {
    expect(formatRelative(new Date(now - 3 * 86400000))).toBe("3d ago");
  });

  it("uses week buckets under a month", () => {
    expect(formatRelative(new Date(now - 14 * 86400000))).toBe("2w ago");
  });

  it("uses month buckets under a year", () => {
    expect(formatRelative(new Date(now - 90 * 86400000))).toBe("3mo ago");
  });

  it("uses year buckets after a year", () => {
    expect(formatRelative(new Date(now - 800 * 86400000))).toBe("2y ago");
  });
});
