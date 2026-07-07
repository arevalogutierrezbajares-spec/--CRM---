/**
 * Canonical public origin for guest-facing links (partner-room access URLs,
 * OG metadata). Single source of truth — a domain move happens here only.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://x.caneycloud.com"
).replace(/\/+$/, "");
