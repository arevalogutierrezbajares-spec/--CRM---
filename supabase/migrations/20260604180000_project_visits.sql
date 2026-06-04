-- FR-PMO — track recently opened projects per user (Home "Recent"). Idempotent.
create table if not exists public.project_visits (
  user_id      uuid not null references public.users(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  visited_at   timestamptz not null default now(),
  primary key (user_id, project_id)
);
create index if not exists project_visits_recent_idx
  on public.project_visits (user_id, visited_at desc);

alter table public.project_visits enable row level security;
drop policy if exists project_visits_self on public.project_visits;
create policy project_visits_self on public.project_visits
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
