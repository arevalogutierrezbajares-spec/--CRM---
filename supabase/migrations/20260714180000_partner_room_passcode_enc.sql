-- Store the room's 4-digit code encrypted (display-only) so an operator can
-- re-view/share it. passcode_hash still gates entry. Nullable — no code, or a
-- code set before this column existed (re-set it to populate).

ALTER TABLE partner_rooms
  ADD COLUMN IF NOT EXISTS passcode_enc text;
