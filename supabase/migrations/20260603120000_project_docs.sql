-- FR-DOC-COLLAB — in-app collaborative documents.
-- A doc is a project_links row with kind='doc'; its editable content (the Yjs
-- CRDT state + a plain-text mirror for search/preview) lives in a side table.
-- Idempotent.

-- 1. New link kind. Not used elsewhere in this migration, so adding the enum
--    value here is transaction-safe on PG12+.
alter type project_link_kind add value if not exists 'doc';

-- 2. Content side table, keyed 1:1 to the project_links row.
create table if not exists public.project_doc_contents (
  link_id      uuid primary key references public.project_links(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  -- Encoded Yjs document state (Y.encodeStateAsUpdate), base64. Null until first save.
  ydoc         text,
  -- Markdown mirror of the latest content, for list previews + search.
  text         text not null default '',
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id)
);

create index if not exists project_doc_contents_workspace_idx
  on public.project_doc_contents (workspace_id);

-- 3. RLS (defense in depth — server actions run as the postgres role and also
--    enforce workspace scope). A user may touch a doc's content only when they
--    belong to its workspace.
alter table public.project_doc_contents enable row level security;

drop policy if exists project_doc_contents_select on public.project_doc_contents;
drop policy if exists project_doc_contents_insert on public.project_doc_contents;
drop policy if exists project_doc_contents_update on public.project_doc_contents;

create policy project_doc_contents_select on public.project_doc_contents
  for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = project_doc_contents.workspace_id
    )
  );

create policy project_doc_contents_insert on public.project_doc_contents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = project_doc_contents.workspace_id
    )
  );

create policy project_doc_contents_update on public.project_doc_contents
  for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = project_doc_contents.workspace_id
    )
  );
