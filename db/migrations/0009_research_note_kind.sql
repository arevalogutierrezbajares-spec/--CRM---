-- Research notes: classify by kind so /research surfaces inspiration/knowledge
-- while product specs/PRDs/handoffs are filterable out (they live under projects).

DO $$ BEGIN
  CREATE TYPE "note_kind" AS ENUM ('research', 'product', 'note');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "research_notes"
  ADD COLUMN IF NOT EXISTS "kind" "note_kind" NOT NULL DEFAULT 'note';

CREATE INDEX IF NOT EXISTS "research_notes_kind_idx"
  ON "research_notes" ("workspace_id", "kind");
