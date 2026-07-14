-- Extend guest-facing partner-room languages: add Portuguese, Russian, Arabic.
-- Operator (internal CRM) stays English; these are client-facing room locales.
-- Paired with new dictionaries in lib/partner-room-i18n.ts and RTL support (ar).
--
-- ADD VALUE IF NOT EXISTS is idempotent and (PG 12+) transaction-safe as long as
-- the new values aren't USED in the same transaction — they aren't here.

ALTER TYPE room_locale ADD VALUE IF NOT EXISTS 'pt';
ALTER TYPE room_locale ADD VALUE IF NOT EXISTS 'ru';
ALTER TYPE room_locale ADD VALUE IF NOT EXISTS 'ar';
