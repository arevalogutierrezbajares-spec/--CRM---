-- AGB-004 — Row-Level Security policies
--
-- Run after `pnpm db:push` has created the tables (AGB-000A).
-- Apply via either:
--   psql "$DATABASE_URL" -f supabase/migrations/20260526120000_rls_owner_policies.sql
--   supabase db push
--
-- Strategy: every owned row carries owner_id / created_by referencing auth.uid().
-- Policies enforce "you only see your own rows" at the DB layer. Server actions
-- already filter by owner; RLS is the defense-in-breadth catch for any direct
-- PostgREST exposure (anon key + RPC, future client-side reads via Supabase JS).

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS — readable by self only.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (id = auth.uid());

drop policy if exists users_self_upsert on public.users;
create policy users_self_upsert on public.users
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTACTS — owner-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.contacts enable row level security;

drop policy if exists contacts_owner_select on public.contacts;
create policy contacts_owner_select on public.contacts
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists contacts_owner_insert on public.contacts;
create policy contacts_owner_insert on public.contacts
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists contacts_owner_update on public.contacts;
create policy contacts_owner_update on public.contacts
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists contacts_owner_delete on public.contacts;
create policy contacts_owner_delete on public.contacts
  for delete to authenticated
  using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTACT_CHANNELS — derived from contacts.owner_id.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.contact_channels enable row level security;

drop policy if exists contact_channels_via_contact on public.contact_channels;
create policy contact_channels_via_contact on public.contact_channels
  for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_channels.contact_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_channels.contact_id
        and c.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTACT_TAGS — derived.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.contact_tags enable row level security;

drop policy if exists contact_tags_via_contact on public.contact_tags;
create policy contact_tags_via_contact on public.contact_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id
        and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id
        and c.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TAGS — readable by all authenticated users (shared tag dictionary);
-- mutation gated to authenticated (custom tags can be created by anyone).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tags enable row level security;

drop policy if exists tags_read_all on public.tags;
create policy tags_read_all on public.tags
  for select to authenticated using (true);

drop policy if exists tags_insert_custom on public.tags;
create policy tags_insert_custom on public.tags
  for insert to authenticated with check (true);

drop policy if exists tags_update_custom on public.tags;
create policy tags_update_custom on public.tags
  for update to authenticated using (kind = 'custom') with check (kind = 'custom');

drop policy if exists tags_delete_custom on public.tags;
create policy tags_delete_custom on public.tags
  for delete to authenticated using (kind = 'custom');

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPELINE TEMPLATES + STAGES — read-only shared dictionary.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pipeline_templates enable row level security;
alter table public.pipeline_stages enable row level security;

drop policy if exists pipeline_templates_read on public.pipeline_templates;
create policy pipeline_templates_read on public.pipeline_templates
  for select to authenticated using (true);

drop policy if exists pipeline_stages_read on public.pipeline_stages;
create policy pipeline_stages_read on public.pipeline_stages
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROJECTS — owner-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.projects enable row level security;

drop policy if exists projects_owner_select on public.projects;
create policy projects_owner_select on public.projects
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists projects_owner_insert on public.projects;
create policy projects_owner_insert on public.projects
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists projects_owner_update on public.projects;
create policy projects_owner_update on public.projects
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists projects_owner_delete on public.projects;
create policy projects_owner_delete on public.projects
  for delete to authenticated using (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- PROJECT_CONTACTS — derived.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.project_contacts enable row level security;

drop policy if exists project_contacts_via_project on public.project_contacts;
create policy project_contacts_via_project on public.project_contacts
  for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_contacts.project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_contacts.project_id and p.owner_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- MILESTONES — owner-scoped via owner_id.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.milestones enable row level security;

drop policy if exists milestones_owner_select on public.milestones;
create policy milestones_owner_select on public.milestones
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists milestones_owner_mutate on public.milestones;
create policy milestones_owner_mutate on public.milestones
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- TOUCHES — created_by-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.touches enable row level security;

drop policy if exists touches_creator_select on public.touches;
create policy touches_creator_select on public.touches
  for select to authenticated using (created_by = auth.uid());

drop policy if exists touches_creator_mutate on public.touches;
create policy touches_creator_mutate on public.touches
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- MEETINGS + ATTENDEES — created_by-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.meetings enable row level security;

drop policy if exists meetings_creator_select on public.meetings;
create policy meetings_creator_select on public.meetings
  for select to authenticated using (created_by = auth.uid());

drop policy if exists meetings_creator_mutate on public.meetings;
create policy meetings_creator_mutate on public.meetings
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

alter table public.meeting_attendees enable row level security;

drop policy if exists meeting_attendees_via_meeting on public.meeting_attendees;
create policy meeting_attendees_via_meeting on public.meeting_attendees
  for all to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id and m.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id and m.created_by = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Note: server actions in app/(app)/**/actions.ts already filter by owner.
-- These RLS policies are belt-and-suspenders for direct Supabase client reads
-- (e.g. anon key from a future browser-side feature, or PostgREST endpoints).
-- Service role connections bypass RLS by design; the postgres-js connection in
-- `db/index.ts` uses the pooler URL which is *not* service role — it respects
-- RLS. If a server action ever needs to bypass owner scoping (e.g. cron jobs
-- run as the inbound owner), use a separate connection with the SERVICE_ROLE
-- key or set the appropriate JWT claim at the connection level.
