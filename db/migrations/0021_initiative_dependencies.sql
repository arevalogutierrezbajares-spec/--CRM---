-- Roadmap initiative dependencies. A row means to depends on from. Default finish-to-start.
CREATE TABLE IF NOT EXISTS "initiative_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "from_initiative_id" uuid NOT NULL REFERENCES "initiatives"("id") ON DELETE CASCADE,
  "to_initiative_id" uuid NOT NULL REFERENCES "initiatives"("id") ON DELETE CASCADE,
  "type" text NOT NULL DEFAULT 'finish_to_start',
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "initiative_dependencies_edge_uniq"
  ON "initiative_dependencies" ("from_initiative_id", "to_initiative_id");
