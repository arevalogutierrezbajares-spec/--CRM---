-- FR-PMO — per-user Home dashboard layout (widget order / hidden / width).
-- Stored as a JSON array of { id, hidden, width }. Idempotent.
alter table public.users
  add column if not exists dashboard_layout jsonb;
