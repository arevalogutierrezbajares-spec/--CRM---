import { describe, expect, it } from "vitest";
import { NIGO_DISPLAY_NAME, NIGO_USER_ID, nigoDisplayName } from "@/lib/nigo-brand";
import { extractMentionHandles } from "@/lib/town-hall/parse";

describe("ÑIGO branding", () => {
  it("normalizes the system user display name", () => {
    expect(nigoDisplayName(NIGO_USER_ID, "NIGO")).toBe(NIGO_DISPLAY_NAME);
    expect(nigoDisplayName("00000000-0000-0000-0000-000000000000", "Tomas")).toBe("Tomas");
  });

  it("parses unicode mention handles", () => {
    expect(extractMentionHandles("@ÑIGO run the recap")).toContain("ñigo");
  });
});
