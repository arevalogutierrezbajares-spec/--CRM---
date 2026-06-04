-- Priorities / OKRs: quarterly objectives ("Rocks") + measurable key results.
-- Key results double as the weekly scorecard. Idempotent.

do $$ begin
  create type objective_status as enum ('on_track', 'at_risk', 'off_track', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kr_direction as enum ('higher', 'lower');
exception when duplicate_object then null; end $$;

create table if not exists public.objectives (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title        text not null,
  description  text,
  owner_id     uuid references public.users(id) on delete set null,
  quarter      text not null,
  status       objective_status not null default 'on_track',
  sort_order   integer not null default 0,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists objectives_ws_quarter_idx
  on public.objectives (workspace_id, quarter, sort_order);

create table if not exists public.key_results (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  objective_id uuid not null references public.objectives(id) on delete cascade,
  title        text not null,
  owner_id     uuid references public.users(id) on delete set null,
  start_value  double precision not null default 0,
  target       double precision not null default 100,
  current      double precision not null default 0,
  unit         text,
  direction    kr_direction not null default 'higher',
  on_scorecard boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists key_results_objective_idx
  on public.key_results (objective_id, sort_order);
create index if not exists key_results_ws_scorecard_idx
  on public.key_results (workspace_id, on_scorecard);

alter table public.objectives  enable row level security;
alter table public.key_results enable row level security;

drop policy if exists objectives_ws on public.objectives;
create policy objectives_ws on public.objectives
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists key_results_ws on public.key_results;
create policy key_results_ws on public.key_results
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Weekly review (Level-10) — saved notes + a snapshot of the agenda at the time.
create table if not exists public.weekly_reviews (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  week_of        date not null,
  facilitator_id uuid references public.users(id) on delete set null,
  notes          text,
  snapshot       jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists weekly_reviews_ws_idx
  on public.weekly_reviews (workspace_id, week_of desc);

alter table public.weekly_reviews enable row level security;
drop policy if exists weekly_reviews_ws on public.weekly_reviews;
create policy weekly_reviews_ws on public.weekly_reviews
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
