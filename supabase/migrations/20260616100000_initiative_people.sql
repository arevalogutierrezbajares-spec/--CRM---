-- Roadmap @-mentions: people tagged on an initiative.
-- Distinct from the single owner (initiatives.owner_user_id); an item can carry
-- many tagged collaborators. Re-synced from the @tokens in the initiative title
-- on each title save, and powers the "filter roadmap by person" bubble click.

create table if not exists public.initiative_people (
  initiative_id uuid not null references public.initiatives(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (initiative_id, user_id)
);

create index if not exists initiative_people_user_idx
  on public.initiative_people (user_id);

-- RLS: gate by membership of the initiative's workspace (mirrors initiatives).
alter table public.initiative_people enable row level security;

drop policy if exists initiative_people_rw on public.initiative_people;
create policy initiative_people_rw on public.initiative_people
  using (
    exists (
      select 1
      from public.initiatives i
      join public.workspace_members wm on wm.workspace_id = i.workspace_id
      where i.id = initiative_people.initiative_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.initiatives i
      join public.workspace_members wm on wm.workspace_id = i.workspace_id
      where i.id = initiative_people.initiative_id
        and wm.user_id = auth.uid()
    )
  );
