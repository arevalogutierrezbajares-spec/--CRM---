-- Shared reminders: a workspace-wide bulletin board, separate from the per-user
-- WhatsApp `reminders` table. Every workspace member sees the same items. Each
-- item can carry global tags and connections to contacts ("people").

CREATE TABLE IF NOT EXISTS "shared_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "body" text,
  "due_at" timestamptz,
  "pinned" boolean NOT NULL DEFAULT false,
  "done_at" timestamptz,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "shared_reminder_tags" (
  "reminder_id" uuid NOT NULL REFERENCES "shared_reminders"("id") ON DELETE CASCADE,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE CASCADE,
  PRIMARY KEY ("reminder_id", "tag_id")
);

CREATE TABLE IF NOT EXISTS "shared_reminder_contacts" (
  "reminder_id" uuid NOT NULL REFERENCES "shared_reminders"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  PRIMARY KEY ("reminder_id", "contact_id")
);

CREATE INDEX IF NOT EXISTS "shared_reminders_workspace_idx" ON "shared_reminders" ("workspace_id");
