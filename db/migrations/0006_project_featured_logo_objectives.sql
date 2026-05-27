-- Projects: featured (pin to top), logo_url (image path), objectives (JSON bullets).

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "featured" boolean NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "logo_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "objectives" jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "projects_featured_idx"
  ON "projects" ("workspace_id", "featured");
