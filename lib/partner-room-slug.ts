/**
 * Pure slug helpers for partner-room guest links. No `server-only` import, so
 * this is safe in both server and client bundles.
 *
 * The guest route `/room/<slug>/<token>` resolves entirely on the token — a
 * next.config rewrite maps it to `/access/<token>`, and the slug segment is
 * never parsed. So the slug is purely cosmetic: it makes a shared link read
 * like `/room/acme-corp/<token>` instead of raw random text, and it does NOT
 * need to be unique. The token remains the sole, unguessable access credential.
 */

/**
 * A URL-safe, human-readable slug derived from a room (or partner) name.
 * Strips accents, lowercases, and collapses runs of non-alphanumerics to single
 * hyphens. Falls back to "sala" (rooms default to Spanish) when the name has no
 * usable characters.
 */
export function roomSlug(name: string | null | undefined): string {
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: José → jose
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48)
    .replace(/-+$/, ""); // re-trim in case the slice landed mid-hyphen
  return slug || "sala";
}

/**
 * The guest-facing path for a room given its raw access token and name.
 * Relative (no origin) — callers needing an absolute URL prepend the site URL.
 * Prefer this over a bare `/access/<token>` so the shared link reads nicely.
 */
export function partnerRoomGuestPath(
  token: string,
  name: string | null | undefined,
): string {
  return `/room/${roomSlug(name)}/${token}`;
}
