import "server-only";
import { createHash, randomBytes } from "crypto";

export function createPartnerAccessToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPartnerAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
