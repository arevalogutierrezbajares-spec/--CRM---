-- Story presentations + click-to-comment feedback.
-- Native, dynamic decks (slides as JSONB) shareable to external clients via a
-- hashed token, with PPT/Figma-style comments anchored to a slide position.

create table if not exists public.presentations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  subtitle text,
  slides jsonb not null default '[]'::jsonb,
  lob_id uuid references public.lines_of_business(id) on delete set null,
  share_token text unique,
  share_enabled boolean not null default false,
  allow_comments boolean not null default true,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  slide_id text not null,
  x_pct double precision not null,
  y_pct double precision not null,
  body text not null,
  author_user_id uuid references public.users(id) on delete set null,
  author_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists presentations_workspace_idx
  on public.presentations (workspace_id, updated_at desc);
create index if not exists presentation_comments_presentation_idx
  on public.presentation_comments (presentation_id, created_at);

alter table public.presentations enable row level security;
alter table public.presentation_comments enable row level security;

do $$ begin
  drop policy if exists presentations_workspace_rw on public.presentations;
  create policy presentations_workspace_rw on public.presentations
    for all using (public.is_workspace_member(workspace_id))
    with check (public.is_workspace_member(workspace_id));
exception when others then null; end $$;

do $$ begin
  drop policy if exists presentation_comments_workspace_rw on public.presentation_comments;
  create policy presentation_comments_workspace_rw on public.presentation_comments
    for all using (public.is_workspace_member(workspace_id))
    with check (public.is_workspace_member(workspace_id));
exception when others then null; end $$;
