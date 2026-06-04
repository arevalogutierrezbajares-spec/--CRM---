-- Voice notes + action items.
-- voice_notes: transcript of a WhatsApp voice note (Whisper).
-- action_items: tasks extracted from a voice note (or created manually).
-- Workspace-scoped RLS via public.is_workspace_member(uuid). Idempotent.

-- ─── enum ───────────────────────────────────────────────────────────────────
do $$ begin
  create type action_item_status as enum ('open', 'done');
exception when duplicate_object then null; end $$;

-- ─── voice_notes ──────────────────────────────────────────────────────────────
create table if not exists voice_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  transcript text not null,
  source_phone text,
  duration_secs integer,
  language text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists voice_notes_workspace_id_idx on voice_notes(workspace_id);
create index if not exists voice_notes_created_at_idx on voice_notes(created_at desc);

-- ─── action_items ─────────────────────────────────────────────────────────────
create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  description text,
  status action_item_status not null default 'open',
  due_date date,
  priority work_priority,
  voice_note_id uuid references voice_notes(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  created_by uuid not null references users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists action_items_workspace_status_idx
  on action_items(workspace_id, status);
create index if not exists action_items_created_at_idx on action_items(created_at desc);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table voice_notes enable row level security;
alter table action_items enable row level security;

drop policy if exists voice_notes_rw on voice_notes;
create policy voice_notes_rw on voice_notes
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = voice_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = voice_notes.workspace_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists action_items_rw on action_items;
create policy action_items_rw on action_items
  for all to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = action_items.workspace_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = action_items.workspace_id
        and wm.user_id = auth.uid()
    )
  );
