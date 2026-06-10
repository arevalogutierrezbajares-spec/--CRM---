-- Explicit brand-logo selection per room + team assignment (who from your side
-- shows up for this client).

-- null = auto-derive logos from shared docs; array of LoB ids = explicit choice.
alter table partner_rooms add column if not exists brand_lob_ids jsonb;

create table if not exists partner_room_team (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index if not exists partner_room_team_room_idx on partner_room_team(room_id);
create index if not exists partner_room_team_workspace_idx on partner_room_team(workspace_id);

alter table partner_room_team enable row level security;
drop policy if exists "workspace_isolation" on partner_room_team;
create policy "workspace_isolation" on partner_room_team
  using (workspace_id in (select workspace_id from users where id = auth.uid()));
