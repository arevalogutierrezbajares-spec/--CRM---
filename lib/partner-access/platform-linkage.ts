/**
 * Platform linkage chips for partner rooms.
 * Pure helpers — no DB. Used by the room page + unit tests.
 */

export const CANEY_ONBOARDING_STATUSES = [
  "not_started",
  "configured",
  "awaiting_channel",
  "live",
  "blocked",
] as const;

export type CaneyOnboardingStatus = (typeof CANEY_ONBOARDING_STATUSES)[number];

export type PlatformLinkage = {
  caneyTenantId: string | null;
  caneyPropertyId: string | null;
  vavPmsPropertyId: string | null;
  vavListingId: string | null;
  caneyOnboardingStatus: string | null;
};

export type ChipTone = "success" | "warning" | "danger" | "outline";

export type LinkageChip = {
  id: "caney" | "vav" | "channel" | "marketplace";
  label: string;
  detail: string;
  tone: ChipTone;
};

function isPendingShell(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith("vav-pending-"));
}

function isUuidish(id: string | null | undefined): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id.trim(),
  );
}

export function normalizeOnboardingStatus(
  raw: string | null | undefined,
): CaneyOnboardingStatus | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return (CANEY_ONBOARDING_STATUSES as readonly string[]).includes(v)
    ? (v as CaneyOnboardingStatus)
    : null;
}

export function deriveLinkageChips(link: PlatformLinkage): LinkageChip[] {
  const status = normalizeOnboardingStatus(link.caneyOnboardingStatus);
  const hasCaney = isUuidish(link.caneyPropertyId);
  const hasTenant = isUuidish(link.caneyTenantId);
  const vavId = link.vavPmsPropertyId?.trim() || null;
  const pending = isPendingShell(vavId);
  const vavLinked =
    Boolean(vavId) &&
    !pending &&
    (!hasCaney || vavId === link.caneyPropertyId?.trim());
  const vavMismatch =
    Boolean(vavId) &&
    !pending &&
    hasCaney &&
    vavId !== link.caneyPropertyId?.trim();

  // --- CaneyCloud ---
  let caney: LinkageChip;
  if (!hasCaney) {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: "No property id",
      tone: "outline",
    };
  } else if (status === "live") {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: "Live",
      tone: "success",
    };
  } else if (status === "configured" || status === "awaiting_channel") {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: status === "awaiting_channel" ? "Configured · no channel" : "Configured",
      tone: "warning",
    };
  } else if (status === "blocked") {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: "Blocked",
      tone: "danger",
    };
  } else if (status === "not_started") {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: hasTenant ? "Id set · onboard not started" : "Id set",
      tone: "warning",
    };
  } else {
    caney = {
      id: "caney",
      label: "CaneyCloud",
      detail: hasTenant ? "Linked" : "Property linked (no tenant)",
      tone: "success",
    };
  }

  // --- VAV mirror ---
  let vav: LinkageChip;
  if (!vavId) {
    vav = {
      id: "vav",
      label: "VAV mirror",
      detail: "Not linked",
      tone: "outline",
    };
  } else if (pending) {
    vav = {
      id: "vav",
      label: "VAV mirror",
      detail: "Scraped shell only",
      tone: "danger",
    };
  } else if (vavMismatch) {
    vav = {
      id: "vav",
      label: "VAV mirror",
      detail: "Id mismatch vs Caney",
      tone: "danger",
    };
  } else if (vavLinked) {
    vav = {
      id: "vav",
      label: "VAV mirror",
      detail: "Linked",
      tone: "success",
    };
  } else {
    vav = {
      id: "vav",
      label: "VAV mirror",
      detail: "Partial",
      tone: "warning",
    };
  }

  // --- Channel (inferred from onboarding status until we store channel flags) ---
  let channel: LinkageChip;
  if (status === "live") {
    channel = {
      id: "channel",
      label: "VAV channel",
      detail: "Live",
      tone: "success",
    };
  } else if (status === "awaiting_channel") {
    channel = {
      id: "channel",
      label: "VAV channel",
      detail: "Not connected",
      tone: "danger",
    };
  } else if (status === "configured") {
    channel = {
      id: "channel",
      label: "VAV channel",
      detail: "Likely not connected",
      tone: "warning",
    };
  } else {
    channel = {
      id: "channel",
      label: "VAV channel",
      detail: "Unknown",
      tone: "outline",
    };
  }

  // --- Marketplace listing ---
  const listing = link.vavListingId?.trim();
  const marketplace: LinkageChip = listing
    ? {
        id: "marketplace",
        label: "Listing",
        detail: listing.length > 24 ? `${listing.slice(0, 24)}…` : listing,
        tone: "success",
      }
    : {
        id: "marketplace",
        label: "Listing",
        detail: "None",
        tone: "outline",
      };

  return [caney, vav, channel, marketplace];
}

export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return "—";
  const t = id.trim();
  if (t.length <= n + 4) return t;
  return `${t.slice(0, n)}…`;
}
