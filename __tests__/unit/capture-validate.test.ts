import { describe, expect, it } from "vitest";
import { isUuid, MAX_TOTAL_CHUNKS } from "@/lib/capture/validate";

describe("capture path-param validation", () => {
  it("accepts real UUIDs", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000000")).toBe(true);
    expect(isUuid("7a649b94-9395-4206-b11c-ca131448d8c3")).toBe(true);
  });

  it("rejects non-UUIDs that would otherwise 500 a uuid column compare", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("123")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("'; DROP TABLE capture_sessions; --")).toBe(false);
  });

  it("bounds totalChunks well above a realistic 3h call (~360 chunks)", () => {
    expect(MAX_TOTAL_CHUNKS).toBeGreaterThan(1000);
    expect(MAX_TOTAL_CHUNKS).toBeLessThan(100_000);
  });
});
