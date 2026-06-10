-- Partner uploads: files the partner uploads back into their room
create table if not exists partner_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes integer,
  label text,
  note text,
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index partner_uploads_room_idx on partner_uploads(room_id);
create index partner_uploads_workspace_idx on partner_uploads(workspace_id);

-- Partner next steps: shared action items visible to both owner and partner
create table if not exists partner_next_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  text text not null,
  assigned_to text not null default 'partner',
  due_at timestamptz,
  completed_at timestamptz,
  completed_by text,
  sort_order integer not null default 0,
  created_by_user uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partner_next_steps_room_idx on partner_next_steps(room_id);
create index partner_next_steps_workspace_idx on partner_next_steps(workspace_id);

-- Extend the event type enum
alter type partner_access_event_type add value if not exists 'partner_uploaded';
alter type partner_access_event_type add value if not exists 'next_step_created';
alter type partner_access_event_type add value if not exists 'next_step_completed';
alter type partner_access_event_type add value if not exists 'next_step_deleted';

-- RLS: workspace isolation
alter table partner_uploads enable row level security;
alter table partner_next_steps enable row level security;

create policy "workspace_isolation" on partner_uploads
  using (workspace_id in (
    select workspace_id from users where id = auth.uid()
  ));

create policy "workspace_isolation" on partner_next_steps
  using (workspace_id in (
    select workspace_id from users where id = auth.uid()
  ));
