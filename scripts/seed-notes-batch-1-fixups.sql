-- AGB-CRM · Notes batch 1 — fixups per user corrections
--   1) Livio pitched Cloudbeds to UCAIMA (our prospect) behind our backs → add Ucaima, rewrite note
--   2) Livio nationality = Chilean AND Colombian
--   4) Promote takeaway questions #1/#2/#3 to action items (#4 already covered by the narrative item)
--   5) Content ideas → separate clickable link rows (replace the two "Content Ideas" docs)
-- Guarded: aborts if Ucaima already exists. Run ONCE.

do $fx$
declare
  ws       uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  tomas    uuid := 'a408e392-1337-4cb3-acc5-f8c1881f1522';
  p_vav    uuid := '59a04990-af7b-4c8d-ba8f-6afcd541d156';
  p_caney  uuid := '953ff0d5-177e-4826-8bb2-ab917b170d2a';
  livio    uuid;
  anabella uuid;
  ucaima   uuid;
begin
  if exists (select 1 from contacts where workspace_id = ws and name = 'Ucaima') then
    raise exception 'Already fixed up (found Ucaima). Aborting.';
  end if;
  select id into livio    from contacts where workspace_id = ws and name = 'Livio Leopardi';
  select id into anabella from contacts where workspace_id = ws and name = 'Anabella Guzman';

  ---------------------------------------------------------------------------
  -- (1)(2) Rewrite Livio's note — the real story + both nationalities
  ---------------------------------------------------------------------------
  update touches
     set body = $tx$Conectado por Rodolfo Gerstl. Dueño de Delfino Tours (operador turístico; chileno y colombiano — ambas).

⚠️ Fue a ofrecerle Cloudbeds (PMS) por $150 a UCAIMA — un cliente potencial NUESTRO — a nuestras espaldas. Se reveló como poco confiable / desleal. El equipo se alineó en ponerlo en pausa ("en un rincón") por ahora.$tx$
   where contact_id = livio and workspace_id = ws and channel = 'manual';

  ---------------------------------------------------------------------------
  -- (1) Add Ucaima as a prospect (the client Livio went behind us on)
  ---------------------------------------------------------------------------
  insert into contacts (workspace_id, name, type, organization, relationship_type, created_by)
    values (ws, 'Ucaima', 'org', 'Campamento Ucaima', 'prospect', tomas)
    returning id into ucaima;
  insert into project_contacts (project_id, contact_id, role) values
    (p_caney, ucaima, 'prospect'),
    (p_vav,   ucaima, 'prospect')
  on conflict (project_id, contact_id) do nothing;
  insert into touches (workspace_id, contact_id, project_id, channel, body, created_by) values
    (ws, ucaima, p_caney, 'manual',
     $tx$Cliente potencial. Livio Leopardi (Delfino Tours) intentó venderle Cloudbeds (PMS) por $150 a nuestras espaldas — así descubrimos su deslealtad. Oportunidad para nosotros (CaneyCloud / VAV).$tx$, tomas);

  ---------------------------------------------------------------------------
  -- (4) Promote takeaway questions to action items
  ---------------------------------------------------------------------------
  insert into action_items (workspace_id, title, description, status, priority, project_id, contact_id, created_by, assignee_user_id) values
    (ws, 'Ask Anabella: is infrastructure the #1 hurdle — and what''s needed for a working state?',
        'Takeaway #1 — confirm whether infrastructure is the biggest blocker and whether she has a clear view of what it takes to reach a functional state.',
        'open', 'next', p_vav, anabella, tomas, tomas),
    (ws, 'Research the Starlink connectivity angle for our offering',
        'Takeaway #2 — what can we do with Starlink and how do we fold it into the offering? Refs: https://www.share.inc/ (friend, Kenya) · https://thempwr.com/ (uncle, MX launch).',
        'open', 'next', p_vav, null, tomas, tomas),
    (ws, 'Define how VAV expands impact beyond posada operational efficiency',
        'Takeaway #3 — broaden the mission to give the tourism industry access to education, knowledge and technology (not just owner/ops efficiency).',
        'open', 'later', p_vav, null, tomas, tomas);

  ---------------------------------------------------------------------------
  -- (5) Content ideas → separate clickable link rows (drop the two docs)
  ---------------------------------------------------------------------------
  delete from project_links
   where workspace_id = ws and label = 'Content Ideas' and project_id in (p_vav, p_caney);
  -- (project_doc_contents rows cascade on the link delete)

  insert into project_links (workspace_id, project_id, kind, category, label, url, description, created_by, sort_order) values
    (ws, p_vav, 'link', 'marketing', 'Reel reference — DZIxLglS3SC',
       'https://www.instagram.com/reel/DZIxLglS3SC/',
       'Saved as a format/inspiration reference for VAV content.', tomas, 1),
    (ws, p_vav, 'link', 'marketing', 'La Cabra Verde — Venezuela video (mention VAV)',
       'https://www.instagram.com/lacabraverdevzla',
       'Charles''s aunt (@lacabraverdevzla) — video about coming to Venezuela mentioning VAV; free now / affiliate link later. Aligned with the VAV mission.', tomas, 2);

  raise notice 'Fixups applied: Livio note rewritten, Ucaima added, 3 takeaway action items, content ideas → 2 link rows.';
end $fx$;
