-- FR-PMO — attach docs/links directly to an action item, task (milestone), or
-- meeting, independent of the item's project. An attachment is either a
-- reference to an existing project_links row (project_link_id) or a standalone
-- URL (url + label). Idempotent.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'item_entity_type') then
    create type item_entity_type as enum ('action_item', 'milestone', 'meeting');
  end if;
end $$;

create table if not exists public.item_attachments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  entity_type     item_entity_type not null,
  entity_id       uuid not null,
  -- Reference to an existing project doc/file/link, OR null for a standalone url.
  project_link_id uuid references public.project_links(id) on delete cascade,
  url             text,
  label           text not null,
  created_by      uuid references public.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists item_attachments_entity_idx
  on public.item_attachments (entity_type, entity_id);
create index if not exists item_attachments_workspace_idx
  on public.item_attachments (workspace_id);

alter table public.item_attachments enable row level security;

drop policy if exists item_attachments_rw on public.item_attachments;
create policy item_attachments_rw on public.item_attachments
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = item_attachments.workspace_id
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = item_attachments.workspace_id
    )
  );
