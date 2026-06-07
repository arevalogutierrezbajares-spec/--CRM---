import "server-only";
import { createHash, randomBytes } from "crypto";

export function createPitchFeedbackToken() {
  return randomBytes(24).toString("base64url");
}

export function hashPitchFeedbackToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashOptionalPublicSignal(value: string | null | undefined) {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}
