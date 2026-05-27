-- Workspace-based RLS — replaces the per-owner policies in
-- 20260526120000_rls_owner_policies.sql. Idempotent: each policy drops the
-- previous version first.
--
-- Rule: a row is visible to `authenticated` if the row's workspace_id matches
-- a workspace where the caller (auth.uid()) is a member.
--
-- One helper function reduces every policy to a clean EXISTS check.

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: SECURITY DEFINER so it can read workspace_members regardless of
-- caller's own RLS. Stable so the planner can cache results within a query.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = ws and wm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_member(uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS — read only the rows you have a relationship with (yourself + people
-- who share a workspace with you).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users enable row level security;

drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.workspace_members wm_a
      join public.workspace_members wm_b on wm_a.workspace_id = wm_b.workspace_id
      where wm_a.user_id = auth.uid() and wm_b.user_id = users.id
    )
  );

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
-- WORKSPACES + MEMBERS + INVITES
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces
  for select to authenticated
  using (public.is_workspace_member(id));

drop policy if exists workspaces_self_create on public.workspaces;
create policy workspaces_self_create on public.workspaces
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists workspaces_owner_update on public.workspaces;
create policy workspaces_owner_update on public.workspaces
  for update to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspaces.id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists workspace_members_self_select on public.workspace_members;
create policy workspace_members_self_select on public.workspace_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists workspace_members_admin_insert on public.workspace_members;
create policy workspace_members_admin_insert on public.workspace_members
  for insert to authenticated
  with check (
    -- Creator can add themselves as the first member, OR an admin/owner
    -- adds someone else.
    user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

drop policy if exists workspace_invites_member_select on public.workspace_invites;
create policy workspace_invites_member_select on public.workspace_invites
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists workspace_invites_admin_mutate on public.workspace_invites;
create policy workspace_invites_admin_mutate on public.workspace_invites
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTACTS + CHANNELS + TAGS LINKS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.contacts enable row level security;
alter table public.contact_channels enable row level security;
alter table public.contact_tags enable row level security;

drop policy if exists contacts_workspace_all on public.contacts;
create policy contacts_workspace_all on public.contacts
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists contact_channels_via_contact on public.contact_channels;
create policy contact_channels_via_contact on public.contact_channels
  for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_channels.contact_id
        and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_channels.contact_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

drop policy if exists contact_tags_via_contact on public.contact_tags;
create policy contact_tags_via_contact on public.contact_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id
        and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
      where c.id = contact_tags.contact_id
        and public.is_workspace_member(c.workspace_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- TAGS — global dictionary; all authenticated users can read; only custom
-- tags can be mutated by anyone.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tags enable row level security;

drop policy if exists tags_read_all on public.tags;
create policy tags_read_all on public.tags
  for select to authenticated using (true);

drop policy if exists tags_insert_custom on public.tags;
create policy tags_insert_custom on public.tags
  for insert to authenticated with check (kind = 'custom');

drop policy if exists tags_update_custom on public.tags;
create policy tags_update_custom on public.tags
  for update to authenticated using (kind = 'custom') with check (kind = 'custom');

drop policy if exists tags_delete_custom on public.tags;
create policy tags_delete_custom on public.tags
  for delete to authenticated using (kind = 'custom');

-- ─────────────────────────────────────────────────────────────────────────────
-- PIPELINE TEMPLATES + STAGES — read-only seed dictionary.
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
-- PROJECTS + LINKS + MILESTONES
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.projects enable row level security;
alter table public.project_contacts enable row level security;
alter table public.milestones enable row level security;

drop policy if exists projects_workspace_all on public.projects;
create policy projects_workspace_all on public.projects
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists project_contacts_via_project on public.project_contacts;
create policy project_contacts_via_project on public.project_contacts
  for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_contacts.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_contacts.project_id
        and public.is_workspace_member(p.workspace_id)
    )
  );

drop policy if exists milestones_workspace_all on public.milestones;
create policy milestones_workspace_all on public.milestones
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- TOUCHES + MEETINGS + ATTENDEES
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.touches enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;

drop policy if exists touches_workspace_all on public.touches;
create policy touches_workspace_all on public.touches
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists meetings_workspace_all on public.meetings;
create policy meetings_workspace_all on public.meetings
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists meeting_attendees_via_meeting on public.meeting_attendees;
create policy meeting_attendees_via_meeting on public.meeting_attendees
  for all to authenticated
  using (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and public.is_workspace_member(m.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.meetings m
      where m.id = meeting_attendees.meeting_id
        and public.is_workspace_member(m.workspace_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- WHATSAPP AGENT TABLES — reminders are per-user (for_user_id);
-- wa_conversations/wa_activity are scoped by user_id; nudges per-user.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.reminders enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_activity enable row level security;
alter table public.nudges enable row level security;

drop policy if exists reminders_self_select on public.reminders;
create policy reminders_self_select on public.reminders
  for select to authenticated
  using (
    for_user_id = auth.uid()
    or public.is_workspace_member(workspace_id)
  );

drop policy if exists reminders_workspace_mutate on public.reminders;
create policy reminders_workspace_mutate on public.reminders
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists wa_conversations_self on public.wa_conversations;
create policy wa_conversations_self on public.wa_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists wa_activity_self on public.wa_activity;
create policy wa_activity_self on public.wa_activity
  for select to authenticated
  using (
    user_id = auth.uid()
    or (workspace_id is not null and public.is_workspace_member(workspace_id))
  );

drop policy if exists nudges_self on public.nudges;
create policy nudges_self on public.nudges
  for all to authenticated
  using (for_user_id = auth.uid())
  with check (for_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Note: server actions in app/(app)/**/actions.ts call requireUser() then
-- filter every query by the user's current workspace_id at the application
-- layer too. These policies are defense-in-breadth for direct PostgREST /
-- Supabase JS access (e.g., a future browser-side feature using the anon
-- key). Service-role connections bypass RLS by design.
