-- Link recordings to the meeting module.
--
-- Every call captured via /record was filed into call_recordings and (when the
-- contact name matched uniquely) attached to a contact — but it never became a
-- Meeting. So recorded calls hung orphan: they didn't appear in the meeting hub
-- and didn't roll up onto a contact's meeting history. The filing pipeline now
-- creates a meeting (type='call', source='voice') for every filed call and adds
-- the matched contact as an attendee. This column is the durable back-link from
-- the recording to that meeting.
--
-- Nullable + ON DELETE SET NULL: legacy recordings predate the link, and a
-- recording must survive its meeting being deleted (the transcript is the
-- system of record).

ALTER TABLE call_recordings
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS call_recordings_meeting_idx
  ON call_recordings (meeting_id);
