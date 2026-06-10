-- Unified room repository: links/files/media the owner adds directly into a room
-- (alongside project-shared docs), plus a comment thread on any repository entry.

create table if not exists partner_room_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  kind text not null default 'link',          -- link | file
  title text not null,
  description text,
  url text,                                    -- for kind=link
  storage_path text,                           -- for kind=file
  mime_type text,
  size_bytes integer,
  sort_order integer not null default 0,
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists partner_room_items_room_idx on partner_room_items(room_id, sort_order);
create index if not exists partner_room_items_workspace_idx on partner_room_items(workspace_id);

create table if not exists partner_item_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  target_kind text not null,                   -- 'share' | 'item'
  target_id uuid not null,
  author_kind text not null default 'owner',   -- owner | guest
  author_user_id uuid references users(id) on delete set null,
  author_member_id uuid references partner_room_members(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists partner_item_comments_target_idx
  on partner_item_comments(room_id, target_kind, target_id, created_at);

alter type partner_access_event_type add value if not exists 'item_added';
alter type partner_access_event_type add value if not exists 'item_commented';

alter table partner_room_items enable row level security;
alter table partner_item_comments enable row level security;
drop policy if exists "workspace_isolation" on partner_room_items;
create policy "workspace_isolation" on partner_room_items
  using (workspace_id in (select workspace_id from users where id = auth.uid()));
drop policy if exists "workspace_isolation" on partner_item_comments;
create policy "workspace_isolation" on partner_item_comments
  using (workspace_id in (select workspace_id from users where id = auth.uid()));
