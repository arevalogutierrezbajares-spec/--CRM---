-- Meeting materials: curate which project_links (decks / files / docs / links)
-- appear in a given meeting and in what order. The material content stays in
-- project_links (single source of truth); this join is purely the "meeting hub"
-- presentation list. Composite PK prevents attaching the same material twice.

CREATE TABLE IF NOT EXISTS "meeting_materials" (
  "meeting_id" uuid NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "project_link_id" uuid NOT NULL REFERENCES "project_links"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "added_by" uuid REFERENCES "users"("id"),
  "added_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("meeting_id", "project_link_id")
);

CREATE INDEX IF NOT EXISTS "meeting_materials_meeting_idx"
  ON "meeting_materials" ("meeting_id", "sort_order");
CREATE INDEX IF NOT EXISTS "meeting_materials_workspace_idx"
  ON "meeting_materials" ("workspace_id");
