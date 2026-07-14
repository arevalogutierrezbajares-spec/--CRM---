import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

export function createPartnerAccessToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPartnerAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Reversible encryption for the guest link.
//
// The hash above is one-way — great for verifying an incoming /access/<token>,
// useless for ever showing the operator their link again. To let an operator
// generate the link ONCE and re-view/copy it forever, we also store the token
// encrypted (AES-256-GCM) and decrypt it on demand for a logged-in operator.
//
// The key derives from SUPABASE_SERVICE_ROLE_KEY, which is always present
// server-side (already used for cookie HMAC) — so no new env var is needed and
// this works in prod immediately. If the key is somehow absent, encrypt returns
// null: the link just isn't re-copyable for that room, and token minting NEVER
// breaks. Rotating the service-role key would orphan existing ciphertexts
// (decrypt → null) — the operator would regenerate once to get a fresh link.
// Envelope: `v1.<iv>.<tag>.<ciphertext>`, all base64url.
// ─────────────────────────────────────────────────────────────────────────────

function linkKey(): Buffer | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:partner-link-v1`).digest();
}

export function encryptRoomToken(token: string): string | null {
  const key = linkKey();
  if (!key) return null;
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
  } catch {
    return null;
  }
}

export function decryptRoomToken(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const key = linkKey();
  if (!key) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ct = Buffer.from(parts[3], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
