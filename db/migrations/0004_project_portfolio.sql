-- Projects: portfolio display extensions + per-project link cards.

DO $$ BEGIN
  CREATE TYPE "link_category" AS ENUM
    ('business','marketing','tech','ops','design','finance','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "tagline" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "cover_emoji" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "cover_color" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "primary_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "repo_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status_text" text;

CREATE TABLE IF NOT EXISTS "project_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "category" "link_category" NOT NULL DEFAULT 'other',
  "label" text NOT NULL,
  "url" text,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "project_links_project_category_idx"
  ON "project_links" ("project_id", "category", "sort_order");
