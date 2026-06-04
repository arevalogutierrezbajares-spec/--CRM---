-- FR-PRESENCE — track when each user was last active, for "last seen" when a
-- teammate is offline. Updated by a lightweight heartbeat from the app shell.
-- Idempotent.

alter table public.users add column if not exists last_seen_at timestamptz;
