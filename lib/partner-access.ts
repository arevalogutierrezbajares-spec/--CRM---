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
