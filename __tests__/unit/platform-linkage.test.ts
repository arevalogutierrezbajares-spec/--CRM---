import { describe, expect, it } from "vitest";
import {
  deriveLinkageChips,
  normalizeOnboardingStatus,
} from "@/lib/partner-access/platform-linkage";

const UCAIMA = {
  caneyTenantId: "35b05635-902e-4a47-a8c6-e614b605a037",
  caneyPropertyId: "fd0e8ceb-3534-4e50-88c5-4278b1351428",
  vavPmsPropertyId: "vav-pending-70f0e8e6-e4f6-4c44-94e9-afc43c1618af",
  vavListingId: null as string | null,
  caneyOnboardingStatus: "awaiting_channel",
};

describe("platform-linkage", () => {
  it("normalizes onboarding status", () => {
    expect(normalizeOnboardingStatus("awaiting_channel")).toBe("awaiting_channel");
    expect(normalizeOnboardingStatus("LIVE")).toBe("live");
    expect(normalizeOnboardingStatus("nope")).toBeNull();
  });

  it("flags Ucaima-style scraped shell + awaiting channel", () => {
    const chips = deriveLinkageChips(UCAIMA);
    const byId = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(byId.caney.tone).toBe("warning");
    expect(byId.caney.detail).toMatch(/channel/i);
    expect(byId.vav.tone).toBe("danger");
    expect(byId.vav.detail).toMatch(/scraped/i);
    expect(byId.channel.tone).toBe("danger");
    expect(byId.marketplace.detail).toBe("None");
  });

  it("shows success when fully live and ids match", () => {
    const chips = deriveLinkageChips({
      caneyTenantId: UCAIMA.caneyTenantId,
      caneyPropertyId: UCAIMA.caneyPropertyId,
      vavPmsPropertyId: UCAIMA.caneyPropertyId,
      vavListingId: "pms-ucaima",
      caneyOnboardingStatus: "live",
    });
    const byId = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(byId.caney.tone).toBe("success");
    expect(byId.vav.tone).toBe("success");
    expect(byId.channel.tone).toBe("success");
    expect(byId.marketplace.tone).toBe("success");
  });

  it("flags id mismatch between Caney and VAV", () => {
    const chips = deriveLinkageChips({
      caneyTenantId: UCAIMA.caneyTenantId,
      caneyPropertyId: UCAIMA.caneyPropertyId,
      vavPmsPropertyId: "11111111-1111-1111-1111-111111111111",
      vavListingId: null,
      caneyOnboardingStatus: "configured",
    });
    expect(chips.find((c) => c.id === "vav")?.tone).toBe("danger");
  });
});
