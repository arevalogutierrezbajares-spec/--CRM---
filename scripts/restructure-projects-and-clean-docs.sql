-- AGB-CRM · Project restructure + junk-doc cleanup
--   • Delete 122 empty placeholder note-docs (backed up to scripts/backups/ first)
--   • Rename "Restaurants" → "CaneyRestaurant"
--   • Create new "CaneyCloud Academy" project nested under CaneyCloud
-- Guarded: aborts if CaneyCloud Academy already exists. Run ONCE.

do $r$
declare
  ws      uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  tomas   uuid := 'a408e392-1337-4cb3-acc5-f8c1881f1522';
  caney   uuid := '953ff0d5-177e-4826-8bb2-ab917b170d2a';
  deleted int;
begin
  if exists (select 1 from projects where workspace_id = ws and title = 'CaneyCloud Academy') then
    raise exception 'Already restructured (CaneyCloud Academy exists). Aborting.';
  end if;

  -- (1) Delete empty placeholder docs (kind='note', no content). project_doc_contents cascades.
  with junk as (
    select pl.id from project_links pl
    left join project_doc_contents dc on dc.link_id = pl.id
    where pl.workspace_id = ws and pl.kind = 'note'
      and (dc.text is null or length(trim(dc.text)) = 0)
  )
  delete from project_links where id in (select id from junk);
  get diagnostics deleted = row_count;
  raise notice 'Deleted % placeholder docs.', deleted;

  -- (2) Rename Restaurants → CaneyRestaurant (parent already = CaneyCloud)
  update projects set title = 'CaneyRestaurant', updated_at = now()
   where workspace_id = ws and title = 'Restaurants';

  -- (3) New CaneyCloud Academy project, nested under CaneyCloud
  insert into projects (workspace_id, title, status, created_by, parent_project_id,
                        tagline, summary, cover_emoji, cover_color, status_text, featured)
  values (ws, 'CaneyCloud Academy', 'active', tomas, caney,
          'Operator training & certification LMS',
          'In-app academy that teaches posada & restaurant operators how to run CaneyCloud and hospitality best practices.',
          '🎓', '#7C5CFF', 'New — curriculum scaffolding', false);

  raise notice 'Restructure complete: junk removed, Restaurants→CaneyRestaurant, CaneyCloud Academy created.';
end $r$;
