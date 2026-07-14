-- Store the guest access token encrypted (AES-256-GCM) so an operator can
-- re-view/copy the link after creation. The one-way public_access_token_hash
-- still gates /access; this column is display-only. Nullable — rooms created
-- before this column have no recoverable plaintext (regenerate to populate).

ALTER TABLE partner_rooms
  ADD COLUMN IF NOT EXISTS public_access_token_enc text;
