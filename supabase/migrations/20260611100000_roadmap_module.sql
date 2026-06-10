-- Roadmap Module Wave 1 (ROADMAP-MODULE-V1.md §10)
-- Additive + idempotent.
--   1. initiatives.success_criteria  (FR-PRG-2)
--   2. plan_versions                 (FR-PLV-1..3, merge base for FR-RMD-7)
--   3. action_items.milestone_id     (FR-AIT-2/3 — relates-to + promote provenance)

alter table initiatives
  add column if not exists success_criteria text;

create table if not exists plan_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  version integer not null,
  source text not null check (source in ('export', 'import', 'commit')),
  -- The snapshot IS the markdown artifact users saw (OD-3): round-trips
  -- through lib/roadmap-md.ts as the 3-way merge base.
  snapshot_md text not null,
  note text,
  summary jsonb,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create index if not exists plan_versions_workspace_idx
  on plan_versions(workspace_id, version desc);

alter table plan_versions enable row level security;
drop policy if exists "plan_versions_workspace_members" on plan_versions;
create policy "plan_versions_workspace_members" on plan_versions
  using (
    workspace_id in (select workspace_id from users where id = auth.uid())
  );

alter table action_items
  add column if not exists milestone_id uuid references milestones(id) on delete set null;

create index if not exists action_items_milestone_idx
  on action_items(milestone_id) where milestone_id is not null;
