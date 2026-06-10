import "server-only";
import { cookies } from "next/headers";
import { verifyVaultGrant } from "@/lib/vault/crypto.server";
import type { userVaultSettings } from "@/db/vault-schema";

export const VAULT_MAX_ATTEMPTS = 8;
export const VAULT_LOCK_MINUTES = 15;
/** Auto-relock: the grant cookie expires after this many seconds. */
export const VAULT_GRANT_TTL_SECONDS = 15 * 60;
export const VAULT_MIN_PASSPHRASE_LENGTH = 8;

export const VAULT_GRANT_COOKIE = "agb_vault_grant";

export const VAULT_GRANT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VAULT_GRANT_TTL_SECONDS,
};

type VaultSettings = typeof userVaultSettings.$inferSelect;

/** True when this browser carries a valid grant for this user's current passphrase. */
export async function isVaultUnlocked(
  userId: string,
  settings: Pick<VaultSettings, "passphraseHash"> | null,
) {
  if (!settings) return false;
  const store = await cookies();
  const value = store.get(VAULT_GRANT_COOKIE)?.value;
  if (!value) return false;
  return verifyVaultGrant(value, userId, settings.passphraseHash);
}
