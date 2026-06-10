import "server-only";
import { randomBytes } from "node:crypto";

/** URL-safe share token for "anyone with the link" external presentation access. */
export function createShareToken(): string {
  return randomBytes(18).toString("base64url");
}
