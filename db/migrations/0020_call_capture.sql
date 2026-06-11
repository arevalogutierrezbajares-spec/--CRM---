-- CALL-CAPTURE-MODULE-V1: full-call capture from the macOS Helper.
-- Additive only. call_recordings grows audio + attribution + retention columns;
-- capture_sessions tracks the chunked-upload lifecycle (NFR-CALL-OBS-1);
-- capture_tokens holds hashed Helper credentials (NFR-CALL-SEC-2);
-- workspaces gains the audio retention setting (FR-CALL-RET-1).

ALTER TABLE "workspaces"
  ADD COLUMN IF NOT EXISTS "call_audio_retention_days" integer NOT NULL DEFAULT 30;

ALTER TABLE "call_recordings"
  ADD COLUMN IF NOT EXISTS "audio_path" text,
  ADD COLUMN IF NOT EXISTS "audio_bytes" integer,
  ADD COLUMN IF NOT EXISTS "audio_purge_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "audio_purged_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "channels" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "source_app" text,
  ADD COLUMN IF NOT EXISTS "utterances" jsonb,
  ADD COLUMN IF NOT EXISTS "suspect_flags" jsonb,
  ADD COLUMN IF NOT EXISTS "consent_note" text,
  ADD COLUMN IF NOT EXISTS "partial" boolean NOT NULL DEFAULT false;

-- Purge cron scans for un-purged audio past its purge date.
CREATE INDEX IF NOT EXISTS "call_recordings_purge_idx"
  ON "call_recordings" ("audio_purge_at")
  WHERE "audio_path" IS NOT NULL AND "audio_purged_at" IS NULL;

DO $$ BEGIN
  CREATE TYPE "capture_session_status" AS ENUM
    ('recording', 'finalizing', 'filed', 'failed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "capture_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "status" capture_session_status NOT NULL DEFAULT 'recording',
  "source_app" text,
  "sample_rate" integer NOT NULL DEFAULT 16000,
  "channels" integer NOT NULL DEFAULT 2,
  "helper_version" text,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  "duration_secs" integer,
  "last_chunk_seq" integer,
  "last_chunk_at" timestamptz,
  "total_chunks" integer,
  "partial" boolean NOT NULL DEFAULT false,
  "recording_id" uuid REFERENCES "call_recordings"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "capture_sessions_workspace_idx"
  ON "capture_sessions" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "capture_sessions_sweep_idx"
  ON "capture_sessions" ("status", "last_chunk_at");

CREATE TABLE IF NOT EXISTS "capture_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL DEFAULT 'Mac Helper',
  "token_hash" text NOT NULL UNIQUE,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
