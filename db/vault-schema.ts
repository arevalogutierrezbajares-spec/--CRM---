import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Credentials Vault tables. Kept in their own module (not db/schema.ts) — these
// tables are self-contained and queried via the select API, never db.query.*.

export const userVaultSettings = pgTable("user_vault_settings", {
  userId: uuid("user_id").primaryKey(),
  passphraseSalt: text("passphrase_salt").notNull(),
  passphraseHash: text("passphrase_hash").notNull(),
  failedCount: integer("failed_count").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type VaultCategory = "platform" | "demo" | "social" | "other";
export type VaultVisibility = "private" | "workspace";

export const vaultItems = pgTable("vault_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull(),
  ownerUserId: uuid("owner_user_id").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull().default("other"),
  username: text("username"),
  url: text("url"),
  /** AES-256-GCM payload `v1.<iv>.<tag>.<ct>` (base64url) — the password. */
  secretEnc: text("secret_enc"),
  /** Same format — secret notes (recovery codes, 2FA backup, etc.). */
  notesEnc: text("notes_enc"),
  visibility: text("visibility").notNull().default("private"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
