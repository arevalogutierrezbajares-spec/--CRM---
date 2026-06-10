import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  userVaultSettings,
  vaultItems,
  type VaultCategory,
  type VaultVisibility,
} from "@/db/vault-schema";

export type VaultSettingsRow = typeof userVaultSettings.$inferSelect;
export type VaultItemRow = typeof vaultItems.$inferSelect;

/** What the list UI receives — never includes ciphertext or plaintext secrets. */
export type VaultItemListed = {
  id: string;
  label: string;
  category: VaultCategory;
  username: string | null;
  url: string | null;
  visibility: VaultVisibility;
  ownerUserId: string;
  hasSecret: boolean;
  hasNotes: boolean;
  updatedAt: Date;
};

export async function getVaultSettings(
  userId: string,
): Promise<VaultSettingsRow | null> {
  const [row] = await db
    .select()
    .from(userVaultSettings)
    .where(eq(userVaultSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertVaultSettings(args: {
  userId: string;
  passphraseSalt: string;
  passphraseHash: string;
}) {
  await db
    .insert(userVaultSettings)
    .values({
      userId: args.userId,
      passphraseSalt: args.passphraseSalt,
      passphraseHash: args.passphraseHash,
    })
    .onConflictDoUpdate({
      target: userVaultSettings.userId,
      set: {
        passphraseSalt: args.passphraseSalt,
        passphraseHash: args.passphraseHash,
        failedCount: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      },
    });
}

/** Atomic failure increment; sets the lock when the cap is reached. */
export async function recordVaultFailure(userId: string, opts: {
  maxAttempts: number;
  lockMinutes: number;
}) {
  await db
    .update(userVaultSettings)
    .set({
      failedCount: sql`${userVaultSettings.failedCount} + 1`,
      lockedUntil: sql`case when ${userVaultSettings.failedCount} + 1 >= ${opts.maxAttempts}
        then now() + (${opts.lockMinutes} * interval '1 minute') else ${userVaultSettings.lockedUntil} end`,
    })
    .where(eq(userVaultSettings.userId, userId));
}

export async function clearVaultFailures(userId: string) {
  await db
    .update(userVaultSettings)
    .set({ failedCount: 0, lockedUntil: null })
    .where(eq(userVaultSettings.userId, userId));
}

/** Items this user may see: their own + workspace-shared ones. */
export async function listVaultItems(args: {
  workspaceId: string;
  userId: string;
}): Promise<VaultItemListed[]> {
  const rows = await db
    .select()
    .from(vaultItems)
    .where(
      and(
        eq(vaultItems.workspaceId, args.workspaceId),
        or(
          eq(vaultItems.ownerUserId, args.userId),
          eq(vaultItems.visibility, "workspace"),
        ),
      ),
    )
    .orderBy(desc(vaultItems.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    category: r.category as VaultCategory,
    username: r.username,
    url: r.url,
    visibility: r.visibility as VaultVisibility,
    ownerUserId: r.ownerUserId,
    hasSecret: !!r.secretEnc,
    hasNotes: !!r.notesEnc,
    updatedAt: r.updatedAt,
  }));
}

/** Full row (with ciphertext) under the same visibility fence as the list. */
export async function getVaultItemForReveal(args: {
  id: string;
  workspaceId: string;
  userId: string;
}): Promise<VaultItemRow | null> {
  const [row] = await db
    .select()
    .from(vaultItems)
    .where(
      and(
        eq(vaultItems.id, args.id),
        eq(vaultItems.workspaceId, args.workspaceId),
        or(
          eq(vaultItems.ownerUserId, args.userId),
          eq(vaultItems.visibility, "workspace"),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createVaultItem(args: {
  workspaceId: string;
  ownerUserId: string;
  label: string;
  category: VaultCategory;
  username: string | null;
  url: string | null;
  secretEnc: string | null;
  notesEnc: string | null;
  visibility: VaultVisibility;
}) {
  const [row] = await db.insert(vaultItems).values(args).returning();
  return row;
}

/** Edit/delete are owner-only — sharing grants read, never write. */
export async function updateVaultItem(args: {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  patch: Partial<{
    label: string;
    category: VaultCategory;
    username: string | null;
    url: string | null;
    secretEnc: string | null;
    notesEnc: string | null;
    visibility: VaultVisibility;
  }>;
}) {
  const [row] = await db
    .update(vaultItems)
    .set({ ...args.patch, updatedAt: new Date() })
    .where(
      and(
        eq(vaultItems.id, args.id),
        eq(vaultItems.workspaceId, args.workspaceId),
        eq(vaultItems.ownerUserId, args.ownerUserId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function deleteVaultItem(args: {
  id: string;
  workspaceId: string;
  ownerUserId: string;
}) {
  const rows = await db
    .delete(vaultItems)
    .where(
      and(
        eq(vaultItems.id, args.id),
        eq(vaultItems.workspaceId, args.workspaceId),
        eq(vaultItems.ownerUserId, args.ownerUserId),
      ),
    )
    .returning({ id: vaultItems.id });
  return rows.length > 0;
}
