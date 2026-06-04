-- FR-TOWNHALL — reactions + light threading. Idempotent.
alter table public.posts
  add column if not exists parent_post_id uuid references public.posts(id) on delete cascade;
create index if not exists posts_parent_idx on public.posts (parent_post_id);

create table if not exists public.post_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id, emoji)
);
create index if not exists post_reactions_post_idx on public.post_reactions (post_id);

alter table public.post_reactions enable row level security;
drop policy if exists post_reactions_rw on public.post_reactions;
create policy post_reactions_rw on public.post_reactions
  for all to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_reactions.post_id and public.is_workspace_member(p.workspace_id))
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_reactions.post_id and public.is_workspace_member(p.workspace_id))
  );
