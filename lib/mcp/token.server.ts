import "server-only";
import { createHash, randomBytes } from "crypto";

/**
 * Opaque token primitives for the MCP OAuth server. We only ever persist the
 * SHA-256 hash (same approach as Partner Access — lib/partner-access-token.server.ts),
 * so a DB leak can't reconstruct a live token and revocation is just a flag.
 */
export function createToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a PKCE code_verifier against the stored S256 code_challenge.
 * challenge = base64url(sha256(verifier)).
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}
