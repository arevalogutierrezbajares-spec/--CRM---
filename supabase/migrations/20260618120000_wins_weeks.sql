-- WINS board: one row per (workspace, ISO week-Monday) holding the scored
-- W-events + daily aggregates for the weekly-review Reel. Written by
-- scripts/wins-ingest.ts (Claude CLI usage + AGB-CRM git activity), read by
-- /review. Additive + idempotent.

create table if not exists public.wins_weeks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  week_of date not null,
  generated_at timestamptz not null default now(),
  totals jsonb not null,
  days jsonb not null,
  events jsonb not null
);

create unique index if not exists wins_weeks_workspace_week_uniq
  on public.wins_weeks (workspace_id, week_of);
