-- FR-DOC-COMMENTS — threaded discussion + @mentions on any project_links row
-- (a file or a collaborative doc). Mentioning a teammate creates an in-app
-- notification (entity_type='doc_comment', entity_id=link_id) and a WhatsApp
-- DM, mirroring the Town Hall mention pipeline. Idempotent.

-- 1. Comments. Soft-deleted (deleted_at) so a removed comment keeps the thread
--    structure. link_id cascades so deleting a file/doc clears its comments.
create table if not exists public.doc_comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  link_id      uuid not null references public.project_links(id) on delete cascade,
  author_id    uuid not null references public.users(id),
  body         text not null,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists doc_comments_link_idx
  on public.doc_comments (link_id, created_at);
create index if not exists doc_comments_workspace_idx
  on public.doc_comments (workspace_id);

-- 2. Mentions extracted from a comment (one row per mentioned user).
create table if not exists public.doc_comment_mentions (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.doc_comments(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists doc_comment_mentions_unique
  on public.doc_comment_mentions (comment_id, user_id);

-- 3. RLS (defense in depth — server actions run as the postgres role and also
--    enforce workspace scope). A user may touch comments only in their workspace.
alter table public.doc_comments enable row level security;

drop policy if exists doc_comments_select on public.doc_comments;
drop policy if exists doc_comments_insert on public.doc_comments;
drop policy if exists doc_comments_update on public.doc_comments;

create policy doc_comments_select on public.doc_comments
  for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = doc_comments.workspace_id
    )
  );

create policy doc_comments_insert on public.doc_comments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = doc_comments.workspace_id
    )
  );

create policy doc_comments_update on public.doc_comments
  for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid() and wm.workspace_id = doc_comments.workspace_id
    )
  );

-- Mentions inherit access through their parent comment's workspace.
alter table public.doc_comment_mentions enable row level security;

drop policy if exists doc_comment_mentions_select on public.doc_comment_mentions;
drop policy if exists doc_comment_mentions_insert on public.doc_comment_mentions;

create policy doc_comment_mentions_select on public.doc_comment_mentions
  for select to authenticated
  using (
    exists (
      select 1
      from public.doc_comments c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = doc_comment_mentions.comment_id and wm.user_id = auth.uid()
    )
  );

create policy doc_comment_mentions_insert on public.doc_comment_mentions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.doc_comments c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = doc_comment_mentions.comment_id and wm.user_id = auth.uid()
    )
  );
