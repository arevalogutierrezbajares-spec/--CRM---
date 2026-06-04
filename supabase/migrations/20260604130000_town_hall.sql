-- Town Hall — workspace feed + @mentions + #references + in-app notifications.
-- Idempotent: create-if-not-exists tables, enum creation guarded by a do-block,
-- RLS policies scoped to workspace_members (same pattern as the rest of the app).
-- The human applies this; the app only needs the Drizzle mirror to typecheck.

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUMS (guarded — re-running must not error)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_kind') then
    create type public.post_kind as enum ('message', 'note');
  end if;
  if not exists (select 1 from pg_type where typname = 'post_ref_type') then
    create type public.post_ref_type as enum (
      'action_item', 'milestone', 'meeting', 'project', 'doc'
    );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references public.users(id),
  body text not null,
  kind public.post_kind not null default 'message',
  created_at timestamptz not null default now()
);

create table if not exists public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.post_refs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  ref_type public.post_ref_type not null,
  ref_id uuid not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  kind text not null default 'mention',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists posts_workspace_created_idx
  on public.posts (workspace_id, created_at desc);
create index if not exists post_mentions_post_idx
  on public.post_mentions (post_id);
create index if not exists post_mentions_user_idx
  on public.post_mentions (user_id);
create index if not exists post_refs_post_idx
  on public.post_refs (post_id);
create index if not exists notifications_workspace_idx
  on public.notifications (workspace_id);
create index if not exists notifications_recipient_idx
  on public.notifications (user_id, read_at, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — visible/mutable only to members of the row's workspace. Child tables
-- (mentions/refs) authorize via the parent post's workspace.
-- ─────────────────────────────────────────────────────────────────────────────

-- Self-contained: define the workspace-membership helper if the base RLS
-- migration (20260527000000) hasn't been applied to this database.
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
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;

alter table public.posts enable row level security;
alter table public.post_mentions enable row level security;
alter table public.post_refs enable row level security;
alter table public.notifications enable row level security;

drop policy if exists posts_workspace_all on public.posts;
create policy posts_workspace_all on public.posts
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists post_mentions_via_post on public.post_mentions;
create policy post_mentions_via_post on public.post_mentions
  for all to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_mentions.post_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_mentions.post_id
        and public.is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists post_refs_via_post on public.post_refs;
create policy post_refs_via_post on public.post_refs
  for all to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_refs.post_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_refs.post_id
        and public.is_workspace_member(p.workspace_id)
    )
  );

-- Notifications: a recipient sees their own; any workspace member can create
-- (fan-out happens from server actions inside the author's workspace).
drop policy if exists notifications_recipient_select on public.notifications;
create policy notifications_recipient_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists notifications_workspace_insert on public.notifications;
create policy notifications_workspace_insert on public.notifications
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id));

drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
