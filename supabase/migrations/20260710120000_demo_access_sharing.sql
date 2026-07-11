-- Demo access sharing.
--
-- Turns an internal "Demo Link" (Platform Management) into a publicly
-- shareable, branded access page at /demo/<token>, and lets a demo be attached
-- to a partner room so it renders as a "Demo access" card inside the room.
--
-- Token is stored RAW (not hashed like partner-room tokens). Justification: a
-- demo page only ever displays demo-account credentials that are already
-- plaintext by design in demo_links (see the table's header comment) — so
-- hashing the token would add friction (regenerate-to-recopy) for near-zero
-- security gain. The URL is unguessable (24 random bytes) and revocable.

ALTER TABLE demo_links
  ADD COLUMN IF NOT EXISTS public_access_token text,
  ADD COLUMN IF NOT EXISTS public_access_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_access_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hero_video_key text;

CREATE UNIQUE INDEX IF NOT EXISTS demo_links_public_access_token_key
  ON demo_links (public_access_token)
  WHERE public_access_token IS NOT NULL;

-- A partner room may feature one demo (null = none). Cleared, not cascaded,
-- when the demo link is deleted.
ALTER TABLE partner_rooms
  ADD COLUMN IF NOT EXISTS demo_link_id uuid
    REFERENCES demo_links (id) ON DELETE SET NULL;
