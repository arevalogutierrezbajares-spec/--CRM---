-- Multi-speaker diarization: map SPEAKER_00 → display names; record STT engine.
ALTER TABLE "call_recordings"
  ADD COLUMN IF NOT EXISTS "speaker_map" jsonb,
  ADD COLUMN IF NOT EXISTS "transcript_engine" text;
