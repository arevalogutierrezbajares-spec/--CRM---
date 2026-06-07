-- Restructure step 1/2: the heavy `projects` table becomes `lines_of_business`
-- (LoB). A new lighter `projects` table (next migration) rolls up to it.
--
-- This migration renames the table, renames the self-reference and all
-- LoB-anchored FK columns (project_id -> lob_id), and repoints the two
-- data-dependent RLS policies. Idempotent (safe to re-run).

-- 1. Rename the table. All inbound FK constraints follow the table OID, and
--    indexes/policies attached to it survive automatically.
alter table if exists public.projects rename to lines_of_business;

-- 2. Rename the self-reference column on the LoB.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='lines_of_business'
               and column_name='parent_project_id') then
    alter table public.lines_of_business rename column parent_project_id to parent_lob_id;
  end if;
end $$;

-- 3. Rename LoB-anchored FK columns (project_id -> lob_id) on dependent tables.
do $$
declare
  t text;
  cols text[] := array[
    'project_links','project_link_audits','project_pins','project_visits',
    'project_contacts','touches','partner_shares','pitch_feedback_campaigns',
    'initiatives','research_notes'
  ];
begin
  foreach t in array cols loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='project_id') then
      execute format('alter table public.%I rename column project_id to lob_id', t);
    end if;
  end loop;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='reminders' and column_name='source_project_id') then
    alter table public.reminders rename column source_project_id to source_lob_id;
  end if;
end $$;

-- 4. Repoint the RLS policies that named the old table/columns directly.
drop policy if exists projects_workspace_all on public.lines_of_business;
create policy lines_of_business_workspace_all on public.lines_of_business
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists project_contacts_via_project on public.project_contacts;
drop policy if exists project_contacts_via_lob on public.project_contacts;
create policy project_contacts_via_lob on public.project_contacts
  for all to authenticated
  using (
    exists (
      select 1 from public.lines_of_business l
      where l.id = project_contacts.lob_id
        and public.is_workspace_member(l.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.lines_of_business l
      where l.id = project_contacts.lob_id
        and public.is_workspace_member(l.workspace_id)
    )
  );
