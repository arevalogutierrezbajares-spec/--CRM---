-- Partner Access: curated partner rooms + share ledger.
-- This is the internal foundation for Partner Rooms without exposing a public
-- portal yet.

do $$ begin
  create type public.partner_kind as enum (
    'creative',
    'equity_capital',
    'non_equity_capital',
    'strategic',
    'operating',
    'advisor',
    'client',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.partner_room_status as enum (
    'draft',
    'active',
    'paused',
    'revoked'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.partner_share_channel as enum (
    'email',
    'whatsapp',
    'signal',
    'link',
    'meeting',
    'manual'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.partner_access_event_type as enum (
    'room_created',
    'room_invited',
    'room_updated',
    'room_status_changed',
    'access_link_generated',
    'share_created',
    'share_sent',
    'viewed',
    'downloaded',
    'commented',
    'question',
    'revoked',
    'expired'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.partner_rooms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  name text not null,
  partner_kind public.partner_kind not null default 'strategic',
  status public.partner_room_status not null default 'draft',
  summary text,
  welcome_message text,
  public_access_token_hash text unique,
  public_access_token_created_at timestamptz,
  public_access_last_viewed_at timestamptz,
  created_by uuid not null references public.users(id),
  expires_at timestamptz,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_room_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.partner_rooms(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  display_name text,
  role_label text,
  invited_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists partner_room_members_room_email_uniq
  on public.partner_room_members(room_id, email);

create table if not exists public.partner_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid references public.partner_rooms(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  project_link_id uuid references public.project_links(id) on delete set null,
  label_snapshot text not null,
  kind_snapshot text not null,
  category_snapshot text,
  url_snapshot text,
  permissions jsonb not null default '["view"]'::jsonb,
  channel public.partner_share_channel not null default 'manual',
  message text,
  shared_by uuid not null references public.users(id),
  shared_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  viewed_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_access_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid references public.partner_rooms(id) on delete set null,
  share_id uuid references public.partner_shares(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type public.partner_access_event_type not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists partner_rooms_workspace_contact_idx
  on public.partner_rooms(workspace_id, primary_contact_id);
create index if not exists partner_rooms_public_access_token_hash_idx
  on public.partner_rooms(public_access_token_hash);
create index if not exists partner_room_members_workspace_room_idx
  on public.partner_room_members(workspace_id, room_id);
create index if not exists partner_shares_workspace_contact_idx
  on public.partner_shares(workspace_id, contact_id, shared_at desc);
create index if not exists partner_shares_workspace_link_idx
  on public.partner_shares(workspace_id, project_link_id);
create index if not exists partner_access_events_workspace_contact_idx
  on public.partner_access_events(workspace_id, contact_id, created_at desc);

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;

alter table public.partner_rooms enable row level security;
alter table public.partner_room_members enable row level security;
alter table public.partner_shares enable row level security;
alter table public.partner_access_events enable row level security;

drop policy if exists partner_rooms_workspace_rw on public.partner_rooms;
create policy partner_rooms_workspace_rw on public.partner_rooms
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists partner_room_members_workspace_rw on public.partner_room_members;
create policy partner_room_members_workspace_rw on public.partner_room_members
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists partner_shares_workspace_rw on public.partner_shares;
create policy partner_shares_workspace_rw on public.partner_shares
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists partner_access_events_workspace_rw on public.partner_access_events;
create policy partner_access_events_workspace_rw on public.partner_access_events
  for all
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
