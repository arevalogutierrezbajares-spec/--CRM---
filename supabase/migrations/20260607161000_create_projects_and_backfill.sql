-- Restructure step 2/2: create the new lighter `projects` table that rolls up to
-- a Line of Business, backfill one child Project per existing LoB, and repoint
-- the Project-level FKs (milestones, meetings, finance) from the LoB id to the
-- new child Project id. Idempotent (safe to re-run).

-- 1. New Project table (execution unit: milestones, finance, meetings hang here).
create table if not exists public.projects (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces(id) on delete cascade,
  lob_id                uuid not null references public.lines_of_business(id) on delete cascade,
  title                 text not null,
  status                project_status not null default 'active',
  due_date              date,
  health_color          health_color not null default 'green',
  waiting_on            text,
  expected_unblock_date date,
  created_by            uuid not null references public.users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists projects_lob_idx on public.projects (lob_id);
create index if not exists projects_workspace_idx on public.projects (workspace_id);

-- 2. Backfill: one child Project per existing LoB, mirroring operational fields.
insert into public.projects (id, workspace_id, lob_id, title, status, due_date,
                             health_color, waiting_on, expected_unblock_date,
                             created_by, created_at, updated_at)
select gen_random_uuid(), l.workspace_id, l.id, l.title, l.status, l.due_date,
       l.health_color, l.waiting_on, l.expected_unblock_date,
       l.created_by, l.created_at, l.updated_at
from public.lines_of_business l
where not exists (select 1 from public.projects p where p.lob_id = l.id);

-- 3. Repoint Project-level FKs from LoB id -> child Project id.
--    For each (table, column, on-delete), drop whatever FK currently constrains
--    the column (its name differs between drizzle-push and hand-applied DBs),
--    rewrite the values, then re-add the FK pointing at public.projects.
do $$
declare
  spec record;
  con  text;
begin
  for spec in
    select * from (values
      ('milestones',      'project_id',        'cascade'),
      ('meetings',        'linked_project_id', 'set null'),
      ('fin_transactions','project_id',        'set null'),
      ('fin_subscriptions','project_id',       'set null'),
      ('action_items',    'project_id',        'set null')
    ) as s(tbl, col, ondelete)
  loop
    -- Only act if the table/column exists.
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=spec.tbl and column_name=spec.col) then
      continue;
    end if;

    -- Drop the existing FK constraint on this column, whatever it is named.
    select conname into con
      from pg_constraint
      where conrelid = format('public.%I', spec.tbl)::regclass
        and contype = 'f'
        and conkey = array[(select attnum from pg_attribute
                            where attrelid = format('public.%I', spec.tbl)::regclass
                              and attname = spec.col)];
    if con is not null then
      execute format('alter table public.%I drop constraint %I', spec.tbl, con);
    end if;

    -- Rewrite the values (NULLs preserved by the join).
    execute format(
      'update public.%I t set %I = p.id from public.projects p where p.lob_id = t.%I',
      spec.tbl, spec.col, spec.col);

    -- Re-add the FK pointing at the new Project table.
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.projects(id) on delete %s',
      spec.tbl, spec.tbl || '_' || spec.col || '_projects_fk', spec.col, spec.ondelete);
  end loop;
end $$;

-- 4. RLS for the new Project table (workspace-scoped, same shape as the LoB).
alter table public.projects enable row level security;
drop policy if exists projects_workspace_all on public.projects;
create policy projects_workspace_all on public.projects
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
