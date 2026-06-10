"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/current-user";
import {
  encryptVaultSecret,
  decryptVaultSecret,
  hashVaultPassphrase,
  newVaultSalt,
  verifyVaultPassphrase,
  vaultGrantValue,
  isVaultConfigured,
} from "@/lib/vault/crypto.server";
import {
  isVaultUnlocked,
  VAULT_GRANT_COOKIE,
  VAULT_GRANT_COOKIE_OPTIONS,
  VAULT_LOCK_MINUTES,
  VAULT_MAX_ATTEMPTS,
  VAULT_MIN_PASSPHRASE_LENGTH,
} from "@/lib/vault/gate.server";
import {
  clearVaultFailures,
  createVaultItem,
  deleteVaultItem,
  getVaultItemForReveal,
  getVaultSettings,
  recordVaultFailure,
  updateVaultItem,
  upsertVaultSettings,
} from "@/db/queries/vault";
import type { VaultCategory, VaultVisibility } from "@/db/vault-schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const CATEGORIES: VaultCategory[] = ["platform", "demo", "social", "other"];
const VISIBILITIES: VaultVisibility[] = ["private", "workspace"];

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Settings + a passed gate, or a user-facing error. */
async function requireUnlockedVault(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isVaultConfigured()) {
    return { ok: false, error: "Vault not configured — set VAULT_MASTER_KEY" };
  }
  const settings = await getVaultSettings(userId);
  if (!settings) return { ok: false, error: "Set a vault passphrase first" };
  if (!(await isVaultUnlocked(userId, settings))) {
    return { ok: false, error: "Vault is locked — unlock it first" };
  }
  return { ok: true };
}

/** First-time setup, or change with the current passphrase. */
export async function setupVaultAction(input: {
  passphrase: string;
  currentPassphrase?: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!isVaultConfigured()) {
    return { ok: false, error: "Vault not configured — set VAULT_MASTER_KEY" };
  }
  const passphrase = input.passphrase ?? "";
  if (passphrase.length < VAULT_MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      error: `Passphrase must be at least ${VAULT_MIN_PASSPHRASE_LENGTH} characters`,
    };
  }
  const existing = await getVaultSettings(user.id);
  if (existing) {
    const current = input.currentPassphrase ?? "";
    if (
      !verifyVaultPassphrase(
        current,
        existing.passphraseSalt,
        existing.passphraseHash,
      )
    ) {
      return { ok: false, error: "Current passphrase is incorrect" };
    }
  }
  const salt = newVaultSalt();
  const hash = hashVaultPassphrase(passphrase, salt);
  await upsertVaultSettings({
    userId: user.id,
    passphraseSalt: salt,
    passphraseHash: hash,
  });
  // Unlock this browser right away; all other grants are now invalid.
  const store = await cookies();
  store.set(
    VAULT_GRANT_COOKIE,
    vaultGrantValue(user.id, hash),
    VAULT_GRANT_COOKIE_OPTIONS,
  );
  revalidatePath("/platforms");
  return { ok: true };
}

export async function unlockVaultAction(input: {
  passphrase: string;
}): Promise<Result> {
  const user = await requireUser();
  if (!isVaultConfigured()) {
    return { ok: false, error: "Vault not configured — set VAULT_MASTER_KEY" };
  }
  const settings = await getVaultSettings(user.id);
  if (!settings) return { ok: false, error: "Set a vault passphrase first" };
  if (settings.lockedUntil && settings.lockedUntil > new Date()) {
    return {
      ok: false,
      error: `Too many attempts — locked for ${VAULT_LOCK_MINUTES} minutes`,
    };
  }
  if (
    !verifyVaultPassphrase(
      input.passphrase ?? "",
      settings.passphraseSalt,
      settings.passphraseHash,
    )
  ) {
    await recordVaultFailure(user.id, {
      maxAttempts: VAULT_MAX_ATTEMPTS,
      lockMinutes: VAULT_LOCK_MINUTES,
    });
    return { ok: false, error: "Wrong passphrase" };
  }
  await clearVaultFailures(user.id);
  const store = await cookies();
  store.set(
    VAULT_GRANT_COOKIE,
    vaultGrantValue(user.id, settings.passphraseHash),
    VAULT_GRANT_COOKIE_OPTIONS,
  );
  revalidatePath("/platforms");
  return { ok: true };
}

export async function lockVaultAction(): Promise<Result> {
  await requireUser();
  const store = await cookies();
  store.delete(VAULT_GRANT_COOKIE);
  revalidatePath("/platforms");
  return { ok: true };
}

export async function createVaultItemAction(input: {
  label: string;
  category: string;
  username?: string;
  url?: string;
  password?: string;
  notes?: string;
  visibility: string;
}): Promise<Result> {
  const user = await requireUser();
  const gate = await requireUnlockedVault(user.id);
  if (!gate.ok) return gate;

  const label = clean(input.label, 120);
  if (!label) return { ok: false, error: "Label is required" };
  const category = CATEGORIES.includes(input.category as VaultCategory)
    ? (input.category as VaultCategory)
    : "other";
  const visibility = VISIBILITIES.includes(input.visibility as VaultVisibility)
    ? (input.visibility as VaultVisibility)
    : "private";
  const password = clean(input.password, 2000);
  const notes = clean(input.notes, 8000);

  await createVaultItem({
    workspaceId: user.workspaceId,
    ownerUserId: user.id,
    label,
    category,
    username: clean(input.username, 320),
    url: clean(input.url, 2000),
    secretEnc: password ? encryptVaultSecret(password) : null,
    notesEnc: notes ? encryptVaultSecret(notes) : null,
    visibility,
  });
  revalidatePath("/platforms");
  return { ok: true };
}

export async function updateVaultItemAction(input: {
  id: string;
  label: string;
  category: string;
  username?: string;
  url?: string;
  /** Omit to keep the stored password; empty string clears it. */
  password?: string;
  /** Same semantics as password. */
  notes?: string;
  visibility: string;
}): Promise<Result> {
  const user = await requireUser();
  const gate = await requireUnlockedVault(user.id);
  if (!gate.ok) return gate;

  const label = clean(input.label, 120);
  if (!label) return { ok: false, error: "Label is required" };

  const patch: Parameters<typeof updateVaultItem>[0]["patch"] = {
    label,
    category: CATEGORIES.includes(input.category as VaultCategory)
      ? (input.category as VaultCategory)
      : "other",
    username: clean(input.username, 320),
    url: clean(input.url, 2000),
    visibility: VISIBILITIES.includes(input.visibility as VaultVisibility)
      ? (input.visibility as VaultVisibility)
      : "private",
  };
  if (input.password !== undefined) {
    const password = clean(input.password, 2000);
    patch.secretEnc = password ? encryptVaultSecret(password) : null;
  }
  if (input.notes !== undefined) {
    const notes = clean(input.notes, 8000);
    patch.notesEnc = notes ? encryptVaultSecret(notes) : null;
  }

  const row = await updateVaultItem({
    id: input.id,
    workspaceId: user.workspaceId,
    ownerUserId: user.id,
    patch,
  });
  if (!row) return { ok: false, error: "Item not found (only the owner can edit)" };
  revalidatePath("/platforms");
  return { ok: true };
}

export async function deleteVaultItemAction(input: {
  id: string;
}): Promise<Result> {
  const user = await requireUser();
  const gate = await requireUnlockedVault(user.id);
  if (!gate.ok) return gate;
  const deleted = await deleteVaultItem({
    id: input.id,
    workspaceId: user.workspaceId,
    ownerUserId: user.id,
  });
  if (!deleted) {
    return { ok: false, error: "Item not found (only the owner can delete)" };
  }
  revalidatePath("/platforms");
  return { ok: true };
}

/** Decrypt one item for display/copy. Gate-checked on every call. */
export async function revealVaultItemAction(input: {
  id: string;
}): Promise<Result<{ password: string | null; notes: string | null }>> {
  const user = await requireUser();
  const gate = await requireUnlockedVault(user.id);
  if (!gate.ok) return gate;
  const row = await getVaultItemForReveal({
    id: input.id,
    workspaceId: user.workspaceId,
    userId: user.id,
  });
  if (!row) return { ok: false, error: "Item not found" };
  try {
    return {
      ok: true,
      password: row.secretEnc ? decryptVaultSecret(row.secretEnc) : null,
      notes: row.notesEnc ? decryptVaultSecret(row.notesEnc) : null,
    };
  } catch {
    return { ok: false, error: "Decryption failed — was VAULT_MASTER_KEY rotated?" };
  }
}
