ALTER TABLE "email_drafts"
  ADD COLUMN IF NOT EXISTS "ai_generated" boolean NOT NULL DEFAULT false;

ALTER TABLE "email_drafts"
  ADD COLUMN IF NOT EXISTS "ai_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;
