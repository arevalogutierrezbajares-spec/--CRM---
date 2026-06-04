-- Generalize notifications beyond Town Hall posts: a notification can now point
-- at any entity (action_item / milestone / meeting / post) and record who acted
-- + a title snapshot, so assigning/@mentioning/pinging someone about an item
-- drops a deep-linkable notification in their bell. Idempotent. RLS already
-- covers public.notifications (20260604130000_town_hall.sql).

alter table public.notifications
  add column if not exists actor_id    uuid references public.users(id) on delete set null,
  add column if not exists entity_type text,
  add column if not exists entity_id   uuid,
  add column if not exists title       text;

create index if not exists notifications_entity_idx
  on public.notifications (entity_type, entity_id);
