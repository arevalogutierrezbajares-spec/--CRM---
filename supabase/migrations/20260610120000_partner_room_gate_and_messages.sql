-- Partner room gate (optional 4-digit passcode on the public link), client
-- self-identification, two-way room messages, and meeting provenance on shares.

-- 1) Room passcode gate
alter table partner_rooms add column if not exists passcode_hash text;
alter table partner_rooms add column if not exists passcode_failed_count integer not null default 0;
alter table partner_rooms add column if not exists passcode_locked_until timestamptz;

-- 2) Meeting provenance on shares (which meeting a material was shared from)
alter table partner_shares add column if not exists meeting_id uuid references meetings(id) on delete set null;
create index if not exists partner_shares_meeting_idx on partner_shares(meeting_id);

-- 3) Room messages: lightweight two-way thread between owner and partner
create table if not exists partner_room_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  room_id uuid not null references partner_rooms(id) on delete cascade,
  author_kind text not null default 'owner',
  author_user_id uuid references users(id) on delete set null,
  author_member_id uuid references partner_room_members(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists partner_room_messages_room_idx on partner_room_messages(room_id, created_at);
create index if not exists partner_room_messages_workspace_idx on partner_room_messages(workspace_id);

alter table partner_room_messages enable row level security;
drop policy if exists "workspace_isolation" on partner_room_messages;
create policy "workspace_isolation" on partner_room_messages
  using (workspace_id in (
    select workspace_id from users where id = auth.uid()
  ));

-- 4) New event types
alter type partner_access_event_type add value if not exists 'member_identified';
alter type partner_access_event_type add value if not exists 'message_posted';
alter type partner_access_event_type add value if not exists 'passcode_set';
alter type partner_access_event_type add value if not exists 'passcode_removed';
alter type partner_access_event_type add value if not exists 'share_updated';
