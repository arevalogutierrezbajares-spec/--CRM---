-- Content-addressed translation cache for operator-authored room content.
--
-- Operators write welcome messages, next-step text, document labels, and chat in
-- Spanish/English. When a room's guest locale is pt/ru/ar, that content is
-- translated once via Claude and cached here, keyed by a hash of the source
-- text + target locale. Editing the source changes the hash → a fresh row; the
-- stale row is harmless and can be GC'd later. Same text → one translation,
-- shared across rooms (dedup). Not for UI chrome — that lives in typed
-- dictionaries (lib/partner-room-i18n.ts).

CREATE TABLE IF NOT EXISTS partner_room_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 of the normalized source text (hex). Content-addressed cache key.
  source_hash text NOT NULL,
  target_locale room_locale NOT NULL,
  -- Best-effort source language tag (e.g. 'es' | 'en'), for auditing only.
  source_lang text,
  -- The original text, kept so we can serve "show original" and re-audit.
  source_text text NOT NULL,
  translated_text text NOT NULL,
  -- Optional owning workspace, for scoped cleanup; null = shared/global.
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_room_translations_hash_locale_uniq
    UNIQUE (source_hash, target_locale)
);

CREATE INDEX IF NOT EXISTS partner_room_translations_lookup_idx
  ON partner_room_translations (source_hash, target_locale);
