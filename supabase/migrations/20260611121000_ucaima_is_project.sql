-- Correction to 20260611120000: Ucaima Transformation was nested under VAV
-- (parent_lob_id), so the kind backfill made it a business module and the
-- project↔business seed skipped it. Per spec it is a standalone PROJECT that
-- rolls up to BOTH businesses (CaneyCloud + VAV).

update public.lines_of_business
   set kind = 'project',
       parent_lob_id = null
 where title = 'Ucaima Transformation';

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
