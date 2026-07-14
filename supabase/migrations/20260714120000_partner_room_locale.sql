-- Per-room guest-facing language for partner rooms.
-- Extensible: add a value to the enum + a dictionary in lib/partner-room-i18n.ts.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_locale') THEN
    CREATE TYPE room_locale AS ENUM ('es', 'en');
  END IF;
END$$;

ALTER TABLE partner_rooms
  ADD COLUMN IF NOT EXISTS locale room_locale NOT NULL DEFAULT 'es';
