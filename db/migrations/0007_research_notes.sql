-- Research notes mirror: index Obsidian-style markdown brains on disk so
-- notes are searchable + linkable from projects.

CREATE TABLE IF NOT EXISTS "research_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "source_root" text NOT NULL,           -- e.g. 'vz-docs' or 'VZ_Tourism_Project/docs'
  "rel_path" text NOT NULL,              -- path within source_root, with .md
  "title" text NOT NULL,
  "summary" text,
  "folder" text,                         -- top-level folder for grouping
  "word_count" integer NOT NULL DEFAULT 0,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_modified" timestamp with time zone,
  "content_hash" text,
  "indexed_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("workspace_id", "source_root", "rel_path")
);

CREATE INDEX IF NOT EXISTS "research_notes_workspace_modified_idx"
  ON "research_notes" ("workspace_id", "last_modified" DESC);
CREATE INDEX IF NOT EXISTS "research_notes_project_idx"
  ON "research_notes" ("project_id");
CREATE INDEX IF NOT EXISTS "research_notes_folder_idx"
  ON "research_notes" ("workspace_id", "folder");
