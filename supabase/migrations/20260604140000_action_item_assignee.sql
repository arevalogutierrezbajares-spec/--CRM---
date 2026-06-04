-- FR-PMO — give action items a real assignee (was previously encoded in the
-- description). Idempotent.
alter table public.action_items
  add column if not exists assignee_user_id uuid references public.users(id);

create index if not exists action_items_assignee_idx
  on public.action_items (assignee_user_id);
