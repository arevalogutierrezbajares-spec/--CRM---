-- Inbox snooze: a notification can be deferred until a time; it auto-resurfaces
-- when new activity on the same entity arrives (notifyUsers clears this). RLS
-- already covers public.notifications. Idempotent.

alter table public.notifications
  add column if not exists snoozed_until timestamptz;

create index if not exists notifications_inbox_idx
  on public.notifications (workspace_id, user_id, read_at, snoozed_until);
