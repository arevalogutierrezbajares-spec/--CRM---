-- Projects: add self-referential parent_project_id for module/sub-project nesting.
-- Example: CaneyCloud (parent) → Stays / Restaurants / WA Concierge (children).

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "parent_project_id" uuid
  REFERENCES "projects"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "projects_parent_idx"
  ON "projects" ("workspace_id", "parent_project_id");
