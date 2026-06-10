import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Optional 4-digit gate on top of the public access token. The token (160-bit,
// hashed) is the real lock; the passcode exists to stop casual link-forwarding.
// The grant cookie is derived from the stored passcode hash, so changing or
// clearing the passcode invalidates every previously issued grant.

export const PARTNER_PASSCODE_MAX_ATTEMPTS = 8;
export const PARTNER_PASSCODE_LOCK_MINUTES = 15;

export function isValidPartnerPasscode(value: string) {
  return /^\d{4}$/.test(value);
}

export function hashPartnerRoomPasscode(roomId: string, passcode: string) {
  return createHash("sha256")
    .update(`pa-pin:${roomId}:${passcode}`)
    .digest("hex");
}

function cookieSafeRoomId(roomId: string) {
  return roomId.replace(/-/g, "");
}

export function partnerGateCookieName(roomId: string) {
  return `pa_grant_${cookieSafeRoomId(roomId)}`;
}

export function partnerMemberCookieName(roomId: string) {
  return `pa_member_${cookieSafeRoomId(roomId)}`;
}

export function partnerGateCookieValue(roomId: string, passcodeHash: string) {
  return createHash("sha256")
    .update(`pa-grant:${roomId}:${passcodeHash}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

export function verifyPasscodeAgainstHash(
  roomId: string,
  passcode: string,
  passcodeHash: string,
) {
  return safeEqualHex(hashPartnerRoomPasscode(roomId, passcode), passcodeHash);
}

/** True when the room has no passcode, or the visitor carries a valid grant cookie. */
export async function isPartnerRoomUnlocked(room: {
  id: string;
  passcodeHash: string | null;
}) {
  if (!room.passcodeHash) return true;
  const store = await cookies();
  const value = store.get(partnerGateCookieName(room.id))?.value;
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return false;
  return safeEqualHex(value, partnerGateCookieValue(room.id, room.passcodeHash));
}

// The member cookie is signed with a server-only secret so a visitor can't
// impersonate another member of the same room by guessing their UUID. Falls
// back to unsigned in environments without the secret (local dev).
function memberCookieSecret(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function memberCookieSignature(roomId: string, memberId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`pa-member:${roomId}:${memberId}`)
    .digest("hex");
}

/** Cookie value for an identified member: `<uuid>.<hmac>` (or bare uuid in dev). */
export function partnerMemberCookieValue(roomId: string, memberId: string) {
  const secret = memberCookieSecret();
  if (!secret) return memberId;
  return `${memberId}.${memberCookieSignature(roomId, memberId, secret)}`;
}

/** The member id this visitor identified as, if the cookie matches the room. */
export async function getPartnerMemberIdFromCookies(roomId: string) {
  const store = await cookies();
  const value = store.get(partnerMemberCookieName(roomId))?.value;
  if (!value) return null;

  const [memberId, signature] = value.split(".", 2);
  if (!/^[0-9a-f-]{36}$/.test(memberId ?? "")) return null;

  const secret = memberCookieSecret();
  if (!secret) return signature ? null : memberId;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
  return safeEqualHex(signature, memberCookieSignature(roomId, memberId, secret))
    ? memberId
    : null;
}

export const PARTNER_GATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
