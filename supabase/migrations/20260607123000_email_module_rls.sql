-- Email module RLS.
--
-- Direct Supabase access must not leak mailbox existence, counts, snippets, or
-- attachment metadata outside the CRM mailbox access model. The app server still
-- performs its own authorization checks; these policies are the database backstop.

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = ws
      and wm.user_id = auth.uid()
      and wm.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_workspace_admin(uuid)
  to authenticated, service_role;

create or replace function public.can_access_email_mailbox(mailbox uuid, required_right text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.email_mailboxes m
    join public.workspace_members wm
      on wm.workspace_id = m.workspace_id
     and wm.user_id = auth.uid()
    left join public.email_mailbox_access grant_row
      on grant_row.mailbox_id = m.id
     and grant_row.user_id = auth.uid()
    where m.id = mailbox
      and m.status <> 'deactivated'
      and (
        wm.role = 'owner'
        or (m.type = 'personal' and m.owner_user_id = auth.uid())
        or (
          grant_row.id is not null
          and case required_right
            when 'view' then grant_row.can_view
            when 'reply' then grant_row.can_reply
            when 'send_as' then grant_row.can_send_as
            when 'assign' then grant_row.can_assign
            when 'manage_access' then grant_row.can_manage_access
            when 'manage_settings' then grant_row.can_manage_settings
            else false
          end
        )
      )
      and case required_right
        when 'view' then m.sync_enabled
        when 'reply' then m.send_enabled
        when 'send_as' then m.send_enabled
        else true
      end
  );
$$;

grant execute on function public.can_access_email_mailbox(uuid, text)
  to authenticated, service_role;

create or replace function public.can_access_email_thread(thread uuid, required_right text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.email_threads t
    where t.id = thread
      and public.can_access_email_mailbox(t.mailbox_id, required_right)
  );
$$;

grant execute on function public.can_access_email_thread(uuid, text)
  to authenticated, service_role;

-- Provider connection rows include token columns; direct authenticated access is
-- limited to workspace owners/admins. Normal members use server-side module data.
alter table public.email_provider_connections enable row level security;

drop policy if exists email_provider_connections_admin_select on public.email_provider_connections;
create policy email_provider_connections_admin_select on public.email_provider_connections
  for select to authenticated
  using (public.is_workspace_admin(workspace_id));

drop policy if exists email_provider_connections_owner_mutate on public.email_provider_connections;
create policy email_provider_connections_owner_mutate on public.email_provider_connections
  for all to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

alter table public.email_mailboxes enable row level security;

drop policy if exists email_mailboxes_access_select on public.email_mailboxes;
create policy email_mailboxes_access_select on public.email_mailboxes
  for select to authenticated
  using (public.can_access_email_mailbox(id, 'view'));

drop policy if exists email_mailboxes_settings_mutate on public.email_mailboxes;
create policy email_mailboxes_settings_mutate on public.email_mailboxes
  for all to authenticated
  using (public.can_access_email_mailbox(id, 'manage_settings') or public.is_workspace_admin(workspace_id))
  with check (public.can_access_email_mailbox(id, 'manage_settings') or public.is_workspace_admin(workspace_id));

alter table public.email_mailbox_access enable row level security;

drop policy if exists email_mailbox_access_review_select on public.email_mailbox_access;
create policy email_mailbox_access_review_select on public.email_mailbox_access
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.can_access_email_mailbox(mailbox_id, 'manage_access')
    or public.is_workspace_admin(workspace_id)
  );

drop policy if exists email_mailbox_access_manager_mutate on public.email_mailbox_access;
create policy email_mailbox_access_manager_mutate on public.email_mailbox_access
  for all to authenticated
  using (public.can_access_email_mailbox(mailbox_id, 'manage_access') or public.is_workspace_admin(workspace_id))
  with check (public.can_access_email_mailbox(mailbox_id, 'manage_access') or public.is_workspace_admin(workspace_id));

alter table public.email_threads enable row level security;

drop policy if exists email_threads_mailbox_select on public.email_threads;
create policy email_threads_mailbox_select on public.email_threads
  for select to authenticated
  using (public.can_access_email_mailbox(mailbox_id, 'view'));

drop policy if exists email_threads_assign_update on public.email_threads;
create policy email_threads_assign_update on public.email_threads
  for update to authenticated
  using (public.can_access_email_mailbox(mailbox_id, 'assign'))
  with check (public.can_access_email_mailbox(mailbox_id, 'assign'));

drop policy if exists email_threads_reply_insert on public.email_threads;
create policy email_threads_reply_insert on public.email_threads
  for insert to authenticated
  with check (public.can_access_email_mailbox(mailbox_id, 'reply'));

alter table public.email_messages enable row level security;

drop policy if exists email_messages_mailbox_select on public.email_messages;
create policy email_messages_mailbox_select on public.email_messages
  for select to authenticated
  using (public.can_access_email_mailbox(mailbox_id, 'view'));

drop policy if exists email_messages_reply_insert on public.email_messages;
create policy email_messages_reply_insert on public.email_messages
  for insert to authenticated
  with check (
    direction = 'outbound'
    and public.can_access_email_mailbox(mailbox_id, 'reply')
    and public.can_access_email_thread(thread_id, 'reply')
  );

alter table public.email_attachments enable row level security;

drop policy if exists email_attachments_message_select on public.email_attachments;
create policy email_attachments_message_select on public.email_attachments
  for select to authenticated
  using (
    exists (
      select 1
      from public.email_messages m
      where m.id = email_attachments.message_id
        and public.can_access_email_mailbox(m.mailbox_id, 'view')
    )
  );

drop policy if exists email_attachments_reply_insert on public.email_attachments;
create policy email_attachments_reply_insert on public.email_attachments
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.email_messages m
      where m.id = email_attachments.message_id
        and public.can_access_email_mailbox(m.mailbox_id, 'reply')
    )
  );

alter table public.email_drafts enable row level security;

drop policy if exists email_drafts_author_select on public.email_drafts;
create policy email_drafts_author_select on public.email_drafts
  for select to authenticated
  using (author_user_id = auth.uid() or public.is_workspace_admin(workspace_id));

drop policy if exists email_drafts_author_mutate on public.email_drafts;
create policy email_drafts_author_mutate on public.email_drafts
  for all to authenticated
  using (
    (author_user_id = auth.uid() and public.can_access_email_mailbox(mailbox_id, 'reply'))
    or public.is_workspace_admin(workspace_id)
  )
  with check (
    (author_user_id = auth.uid() and public.can_access_email_mailbox(mailbox_id, 'reply'))
    or public.is_workspace_admin(workspace_id)
  );

alter table public.email_send_jobs enable row level security;

drop policy if exists email_send_jobs_actor_select on public.email_send_jobs;
create policy email_send_jobs_actor_select on public.email_send_jobs
  for select to authenticated
  using (actor_id = auth.uid() or public.is_workspace_admin(workspace_id));

drop policy if exists email_send_jobs_actor_insert on public.email_send_jobs;
create policy email_send_jobs_actor_insert on public.email_send_jobs
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.can_access_email_mailbox(mailbox_id, 'send_as')
  );

alter table public.email_internal_notes enable row level security;

drop policy if exists email_internal_notes_thread_select on public.email_internal_notes;
create policy email_internal_notes_thread_select on public.email_internal_notes
  for select to authenticated
  using (public.can_access_email_thread(thread_id, 'view'));

drop policy if exists email_internal_notes_thread_insert on public.email_internal_notes;
create policy email_internal_notes_thread_insert on public.email_internal_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and public.can_access_email_thread(thread_id, 'view')
  );

alter table public.email_thread_crm_links enable row level security;

drop policy if exists email_thread_crm_links_thread_select on public.email_thread_crm_links;
create policy email_thread_crm_links_thread_select on public.email_thread_crm_links
  for select to authenticated
  using (public.can_access_email_thread(thread_id, 'view'));

drop policy if exists email_thread_crm_links_thread_insert on public.email_thread_crm_links;
create policy email_thread_crm_links_thread_insert on public.email_thread_crm_links
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_email_thread(thread_id, 'view')
  );

alter table public.email_audit_events enable row level security;

drop policy if exists email_audit_events_admin_or_actor_select on public.email_audit_events;
create policy email_audit_events_admin_or_actor_select on public.email_audit_events
  for select to authenticated
  using (actor_id = auth.uid() or public.is_workspace_admin(workspace_id));

drop policy if exists email_audit_events_actor_insert on public.email_audit_events;
create policy email_audit_events_actor_insert on public.email_audit_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    or public.is_workspace_admin(workspace_id)
  );
