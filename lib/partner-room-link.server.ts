import "server-only";
import { SITE_URL } from "@/lib/site-url";
import { decryptRoomToken } from "@/lib/partner-access-token.server";
import { partnerRoomGuestPath } from "@/lib/partner-room-slug";

/**
 * The full guest link for a room, decrypted from its stored ciphertext for a
 * logged-in operator to view/copy. Returns null when the room has no recoverable
 * token (created before encrypted storage, or the key rotated) — the operator
 * regenerates once to populate it. Never exposes the hash; decryption is
 * server-only.
 *
 * Pass the room `name` to get the pretty `/room/<slug>/<token>` form; omit it
 * and the link falls back to the still-valid `/access/<token>`.
 */
export function partnerRoomGuestUrl(
  encToken: string | null | undefined,
  name?: string | null,
): string | null {
  const token = decryptRoomToken(encToken);
  return token ? `${SITE_URL}${partnerRoomGuestPath(token, name)}` : null;
}
