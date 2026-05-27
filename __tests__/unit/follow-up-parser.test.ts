import { describe, it, expect } from "vitest";
import { parseFollowUp } from "@/lib/wa-agent/tools/log-touch";

const BASE = new Date("2026-05-27T14:00:00Z"); // Wednesday

describe("parseFollowUp", () => {
  it("parses N days", () => {
    const r = parseFollowUp("3 days", BASE);
    expect(r).not.toBeNull();
    expect(r!.getDate()).toBe(30); // May 27 + 3 = May 30
  });

  it("parses N weeks", () => {
    const r = parseFollowUp("2 weeks", BASE);
    expect(r).not.toBeNull();
    // 27 + 14 = June 10
    expect(r!.getMonth()).toBe(5); // June (0-indexed)
    expect(r!.getDate()).toBe(10);
  });

  it("parses N months", () => {
    const r = parseFollowUp("1 month", BASE);
    expect(r).not.toBeNull();
    expect(r!.getMonth()).toBe(5); // June (May=4, +1=5)
  });

  it("parses tomorrow", () => {
    const r = parseFollowUp("tomorrow", BASE);
    expect(r).not.toBeNull();
    expect(r!.getDate()).toBe(28);
    expect(r!.getHours()).toBe(9);
  });

  it("parses next week", () => {
    const r = parseFollowUp("next week", BASE);
    expect(r).not.toBeNull();
    // 27 + 7 = June 3
    expect(r!.getDate()).toBe(3);
  });

  it("parses next Monday", () => {
    // BASE is Wednesday May 27 → next Monday is June 1
    const r = parseFollowUp("next Monday", BASE);
    expect(r).not.toBeNull();
    expect(r!.getDay()).toBe(1); // Monday
    expect(r!.getHours()).toBe(9);
  });

  it("parses Friday", () => {
    // BASE is Wednesday May 27 → next Friday is May 29
    const r = parseFollowUp("Friday", BASE);
    expect(r).not.toBeNull();
    expect(r!.getDay()).toBe(5); // Friday
  });

  it("returns null for gibberish", () => {
    const r = parseFollowUp("whenever", BASE);
    expect(r).toBeNull();
  });
});
