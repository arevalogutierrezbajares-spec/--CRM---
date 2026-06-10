-- Demo links (Platform Management): shareable product demos per platform —
-- a direct deep link (e.g. CaneyCloud `?guia=demo-rapido` guided tours),
-- the demo-account credentials needed to reach it, or both. Demo credentials
-- are plaintext by design (they exist to be handed out); real secrets belong
-- in the vault.

create table if not exists demo_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  platform_id text not null default 'other',
  label text not null,
  description text,
  url text,
  username text,
  password text,
  access_notes text,
  sort_order integer not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists demo_links_workspace_idx on demo_links(workspace_id);

alter table demo_links enable row level security;
drop policy if exists "demo_links_workspace_members" on demo_links;
create policy "demo_links_workspace_members" on demo_links
  using (
    workspace_id in (select workspace_id from users where id = auth.uid())
  );
