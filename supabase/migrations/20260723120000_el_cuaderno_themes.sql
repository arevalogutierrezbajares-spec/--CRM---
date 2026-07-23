-- El Cuaderno Slice 1: theme-structured call documents.
-- The operator's live #theme tags become the skeleton of the filed call doc.
-- `capture_themes` is the durable per-workspace theme registry for the call
-- capture module (slice 1 writes no rows yet — facets keep theme_id null until
-- the upsert lands in a later slice). NOTE: named capture_themes, NOT themes —
-- public.themes already exists (work-management module: initiatives/milestones
-- theming) and is unrelated.
-- `call_theme_facets` is the per-call per-theme rollup that powers cross-call
-- theme queries ("everything said about pricing-model, by date").
-- call_recordings gains the structured document (themed_doc) + the agenda the
-- operator walked in with. Additive + idempotent.

create table if not exists public.capture_themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  label text not null,
  slug text not null,
  color text,
  archived boolean not null default false,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

-- Slug is unique per scope: once workspace-wide (project_id null), once per
-- project. Two partial unique indexes — NULLs never collide in a plain unique
-- index, so a single index on (workspace_id, project_id, slug) would allow
-- duplicate workspace-wide slugs.
create unique index if not exists capture_themes_workspace_slug_uniq
  on public.capture_themes (workspace_id, slug)
  where project_id is null;
create unique index if not exists capture_themes_workspace_project_slug_uniq
  on public.capture_themes (workspace_id, project_id, slug)
  where project_id is not null;

create table if not exists public.call_theme_facets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  call_id uuid not null references public.call_recordings(id) on delete cascade,
  -- Null in slice 1 (no capture_themes upsert yet); links once themes are durable.
  theme_id uuid references public.capture_themes(id) on delete cascade,
  label text not null,
  origin text not null check (origin in ('agenda', 'live', 'ai_suggested_accepted')),
  note_count integer not null default 0,
  quote_count integer not null default 0,
  flag_count integer not null default 0,
  coverage text not null check (coverage in ('covered', 'partial', 'gap')),
  call_date timestamptz not null
);

create index if not exists call_theme_facets_workspace_theme_date_idx
  on public.call_theme_facets (workspace_id, theme_id, call_date);

-- Structured theme document (v1 shape, see lib/capture/themed-doc.ts) + the
-- operator's pre-call agenda as received on finalize. Both null for legacy
-- recordings — the un-themed filing path is unchanged.
alter table public.call_recordings
  add column if not exists themed_doc jsonb,
  add column if not exists agenda jsonb;

-- RLS: gate by workspace membership (mirrors public.functions).
alter table public.capture_themes enable row level security;

drop policy if exists capture_themes_rw on public.capture_themes;
create policy capture_themes_rw on public.capture_themes
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = capture_themes.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = capture_themes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

alter table public.call_theme_facets enable row level security;

drop policy if exists call_theme_facets_rw on public.call_theme_facets;
create policy call_theme_facets_rw on public.call_theme_facets
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = call_theme_facets.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = call_theme_facets.workspace_id
        and wm.user_id = auth.uid()
    )
  );
