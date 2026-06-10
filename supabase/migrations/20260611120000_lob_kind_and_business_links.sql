-- Business / Project split on lines_of_business.
--
-- The portfolio keeps ONE table; a `kind` discriminator separates the two
-- standing BUSINESSES (CaneyCloud + VAV, incl. CaneyCloud's child modules)
-- from every other venture, which becomes a PROJECT with identical
-- functionality. A join table lets a project link to 0..n businesses
-- (e.g. Ucaima Transformation → CaneyCloud + VAV).
--
-- ⚠ Apply via the established `supabase db query --linked` flow with operator
--   approval (never blind db push). Verify afterwards:
--     select title, kind, parent_lob_id from lines_of_business order by kind, title;
--   Expected: exactly 6 kind='business' rows (CaneyCloud + 4 modules + VAV).

-- 1. Enum + column (idempotent)
do $$ begin
  create type lob_kind as enum ('business', 'project');
exception when duplicate_object then null; end $$;

alter table public.lines_of_business
  add column if not exists kind lob_kind not null default 'project';

-- 2. Backfill the two businesses (title-matched; VAV's live title is
--    "VAV — Vamos a Venezuela", so prefix-match it).
update public.lines_of_business
   set kind = 'business'
 where parent_lob_id is null
   and (title = 'CaneyCloud' or title ilike 'VAV%');

-- 3. Children inherit the parent's kind (CaneyCloud modules → business).
update public.lines_of_business c
   set kind = p.kind
  from public.lines_of_business p
 where c.parent_lob_id = p.id
   and c.kind <> p.kind;

-- 4. Project ↔ Business links (many-to-many, workspace-fenced)
create table if not exists public.lob_business_links (
  project_lob_id  uuid not null references public.lines_of_business(id) on delete cascade,
  business_lob_id uuid not null references public.lines_of_business(id) on delete cascade,
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (project_lob_id, business_lob_id)
);

create index if not exists lob_business_links_business_idx
  on public.lob_business_links (business_lob_id);

alter table public.lob_business_links enable row level security;

drop policy if exists lob_business_links_workspace_all on public.lob_business_links;
create policy lob_business_links_workspace_all on public.lob_business_links
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- 5. Seed: Ucaima Transformation belongs to both businesses.
insert into public.lob_business_links (project_lob_id, business_lob_id, workspace_id)
select p.id, b.id, p.workspace_id
  from public.lines_of_business p
  join public.lines_of_business b
    on b.workspace_id = p.workspace_id
   and b.kind = 'business'
   and b.parent_lob_id is null
 where p.title = 'Ucaima Transformation'
   and p.kind = 'project'
on conflict do nothing;
