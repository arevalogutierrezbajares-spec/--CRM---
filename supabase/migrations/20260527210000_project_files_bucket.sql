-- FR-DOC-14/15/16 — private Storage bucket for project file uploads.
-- Single bucket, path-namespaced {workspace_id}/{project_id}/{uuid}-{slug}.
-- 25 MB cap enforced at the bucket level (defense in depth with the app).
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit)
values ('agb-project-files', 'agb-project-files', false, 26214400)
on conflict (id) do update
  set public = false, file_size_limit = 26214400;

-- ─── RLS on storage.objects (NFR-DOC-SEC-1) ─────────────────────────────────
-- A user may read/insert/delete an object only when the object's first path
-- segment is a workspace they belong to. `storage.foldername(name)` returns the
-- path segments as an array; element 1 is the workspace_id.

drop policy if exists agb_project_files_select on storage.objects;
drop policy if exists agb_project_files_insert on storage.objects;
drop policy if exists agb_project_files_delete on storage.objects;

create policy agb_project_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agb-project-files'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy agb_project_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'agb-project-files'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

create policy agb_project_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'agb-project-files'
    and exists (
      select 1 from public.workspace_members wm
      where wm.user_id = auth.uid()
        and wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
