-- Per-workspace switch: keep call audio in CRM storage, or transcript-only.
--
-- When false, the capture finalize pipeline still transcribes the call (audio
-- must reach the server to be transcribed) but does NOT persist the assembled
-- audio to the agb-call-audio bucket — so there's no recurring storage cost.
-- The transcript, brief, and speaker-attributed utterances are always kept.
-- Pair with the Mac Helper's "keep audio on this Mac" option to retain a local
-- copy. Default TRUE preserves current behaviour (audio stored + auto-purged
-- per call_audio_retention_days).

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS store_call_audio boolean NOT NULL DEFAULT true;
