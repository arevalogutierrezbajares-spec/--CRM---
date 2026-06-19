-- FR-E6: roadmap "by Project / Line-of-Business" matrix.
-- LoBs are the VERTICALS (already on initiatives.lob_id). This adds the
-- HORIZONTAL axis: `functions` (Product, Engineering, Growth, Operations,
-- Finance …) that cut across LoBs, plus initiatives.function_id. A reserved
-- `uncategorized` function is the no-orphan fix-me bucket. Additive + idempotent.

create table if not exists public.functions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  color text,
  icon text,
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists functions_workspace_slug_uniq
  on public.functions (workspace_id, slug);

-- Seed default functions for every existing workspace (idempotent via the
-- unique index). `uncategorized` sorts last and is the reserved fix-me bucket.
insert into public.functions (workspace_id, name, slug, sort_order)
select w.id, d.name, d.slug, d.sort_order
from public.workspaces w
cross join (values
  ('Product', 'product', 0),
  ('Engineering', 'engineering', 1),
  ('Growth & Marketing', 'growth', 2),
  ('Operations', 'operations', 3),
  ('Finance', 'finance', 4),
  ('Uncategorized', 'uncategorized', 99)
) as d(name, slug, sort_order)
on conflict (workspace_id, slug) do nothing;

-- initiatives.function_id (nullable at the DB level — deploy-safe; UX prevents orphans).
alter table public.initiatives
  add column if not exists function_id uuid references public.functions(id) on delete set null;

create index if not exists initiatives_function_idx on public.initiatives (function_id);

-- Backfill: point every function-less initiative at its workspace's
-- Uncategorized bucket so NO initiative is invisible in the matrix (AC-E6-7b).
update public.initiatives i
set function_id = f.id
from public.functions f
where f.workspace_id = i.workspace_id
  and f.slug = 'uncategorized'
  and i.function_id is null;

-- RLS: gate by workspace membership (mirrors public.initiatives / initiative_people).
alter table public.functions enable row level security;

drop policy if exists functions_rw on public.functions;
create policy functions_rw on public.functions
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = functions.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = functions.workspace_id
        and wm.user_id = auth.uid()
    )
  );
