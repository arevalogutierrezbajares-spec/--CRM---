-- FR-PMO — per-user pinned projects (quick access on Home). Idempotent.
create table if not exists public.project_pins (
  user_id      uuid not null references public.users(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index if not exists project_pins_user_idx
  on public.project_pins (workspace_id, user_id);

alter table public.project_pins enable row level security;

drop policy if exists project_pins_self on public.project_pins;
create policy project_pins_self on public.project_pins
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));
