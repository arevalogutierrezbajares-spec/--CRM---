-- Call recordings: durable home for every call captured via /record. The old
-- /api/voice/call flow only persisted the transcript as a side-effect of a
-- UNIQUE contact match — so calls with no/ambiguous contact were silently lost,
-- and the brief was never saved at all. This table saves every recording
-- unconditionally; contact attachment is secondary.

CREATE TABLE IF NOT EXISTS "call_recordings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "title" text NOT NULL DEFAULT 'Call',
  "transcript" text NOT NULL,
  "brief" text,
  "language" text,
  "duration_secs" integer,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "action_item_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "call_recordings_workspace_idx"
  ON "call_recordings" ("workspace_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "call_recordings_contact_idx"
  ON "call_recordings" ("contact_id");

-- Provenance link from action items back to the call they came from.
ALTER TABLE "action_items"
  ADD COLUMN IF NOT EXISTS "call_recording_id" uuid
  REFERENCES "call_recordings"("id") ON DELETE SET NULL;
