export const PARTNER_KIND_OPTIONS = [
  { value: "creative", label: "Creative" },
  { value: "equity_capital", label: "Equity Capital" },
  { value: "non_equity_capital", label: "Non-Equity Capital" },
  { value: "strategic", label: "Strategic" },
  { value: "operating", label: "Operating" },
  { value: "advisor", label: "Advisor" },
  { value: "client", label: "Client" },
  { value: "other", label: "Other" },
] as const;

export type PartnerKind = (typeof PARTNER_KIND_OPTIONS)[number]["value"];

export const PARTNER_ROOM_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "revoked", label: "Revoked" },
] as const;

export type PartnerRoomStatus =
  (typeof PARTNER_ROOM_STATUS_OPTIONS)[number]["value"];

export const PARTNER_SHARE_CHANNEL_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "signal", label: "Signal" },
  { value: "link", label: "Link" },
  { value: "meeting", label: "Meeting" },
] as const;

export type PartnerShareChannel =
  (typeof PARTNER_SHARE_CHANNEL_OPTIONS)[number]["value"];

export const PARTNER_PERMISSION_OPTIONS = [
  { value: "view", label: "View" },
  { value: "download", label: "Download" },
  { value: "comment", label: "Comment" },
  { value: "upload", label: "Upload" },
] as const;

export type PartnerPermission =
  (typeof PARTNER_PERMISSION_OPTIONS)[number]["value"];

export function partnerKindLabel(value: string | null | undefined) {
  return (
    PARTNER_KIND_OPTIONS.find((option) => option.value === value)?.label ??
    "Partner"
  );
}

// The single outward-facing label a guest ever sees. Internally rooms still
// carry their real `partner_kind` (strategic / client / equity_capital / …) for
// tracking — that stays admin-only via partnerKindLabel(). Every partner-facing
// surface collapses to this one word.
export const PARTNER_PUBLIC_LABEL = "Aliado";

// Shared between the sign-in intro and the room footer echo — one source so
// the two surfaces can never drift apart.
export const BOLIVAR_QUOTE = "Dios concede la victoria a la perseverancia";

export function partnerRoomStatusLabel(value: string | null | undefined) {
  return (
    PARTNER_ROOM_STATUS_OPTIONS.find((option) => option.value === value)
      ?.label ?? "Draft"
  );
}

export function partnerShareChannelLabel(value: string | null | undefined) {
  return (
    PARTNER_SHARE_CHANNEL_OPTIONS.find((option) => option.value === value)
      ?.label ?? "Manual"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository sections — partner-facing groupings for room repository entries.
// `value` is stored in partner_room_items.category / partner_shares.room_section.
// Null/unknown values fall back to the "documentos" section.
// ─────────────────────────────────────────────────────────────────────────────

export const REPO_SECTION_OPTIONS = [
  { value: "documentos", label: "Documentos" },
  { value: "contratos", label: "Contratos & Legal" },
  { value: "contenido", label: "Contenido & Media" },
  { value: "finanzas", label: "Finanzas" },
  { value: "marca", label: "Marca & Diseño" },
  { value: "informes", label: "Informes" },
] as const;

export type RepoSection = (typeof REPO_SECTION_OPTIONS)[number]["value"];

export const REPO_SECTION_VALUES: ReadonlySet<string> = new Set(
  REPO_SECTION_OPTIONS.map((option) => option.value),
);

export function repoSection(value: string | null | undefined): RepoSection {
  return REPO_SECTION_VALUES.has(value ?? "")
    ? (value as RepoSection)
    : "documentos";
}

export function repoSectionLabel(value: string | null | undefined) {
  return (
    REPO_SECTION_OPTIONS.find((option) => option.value === repoSection(value))
      ?.label ?? "Documentos"
  );
}
