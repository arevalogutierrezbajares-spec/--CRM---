-- Finalize-lease crash safety for capture sessions.
--
-- A finalize that crashed (OOM / timeout / process kill) after claiming a
-- session left it wedged in status='finalizing' forever: the helper retried
-- finalize every 60s and got 409 "already in progress" indefinitely, and the
-- crash-salvage cron only swept 'recording'/'failed' sessions, never
-- 'finalizing'. This adds a lease timestamp so a stale finalize claim becomes
-- reclaimable by a helper retry or the cron after FINALIZE_LEASE_MINUTES.

ALTER TABLE capture_sessions
  ADD COLUMN IF NOT EXISTS finalize_started_at timestamptz;

-- Index for the stale-finalizing sweep (status + lease age).
CREATE INDEX IF NOT EXISTS capture_sessions_finalize_sweep_idx
  ON capture_sessions (status, finalize_started_at);
