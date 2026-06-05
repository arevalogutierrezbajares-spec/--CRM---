-- AGB-CRM · Notes batch 1 (Anabella reunión, new contacts, content ideas, action items)
-- Guarded: aborts if Livio Leopardi already exists. Run ONCE:
--   psql "$DATABASE_URL_with_sslmode" -f scripts/seed-notes-batch-1.sql

do $batch$
declare
  ws       uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  tomas    uuid := 'a408e392-1337-4cb3-acc5-f8c1881f1522';
  p_vav    uuid := '59a04990-af7b-4c8d-ba8f-6afcd541d156';
  p_caney  uuid := '953ff0d5-177e-4826-8bb2-ab917b170d2a';
  anabella uuid;
  rodolfo  uuid;
  livio    uuid;
  alberto  uuid;
  cabra    uuid;
  doc_vav  uuid;
  doc_caney uuid;
begin
  if exists (select 1 from contacts where workspace_id = ws and name = 'Livio Leopardi') then
    raise exception 'Already seeded (found Livio Leopardi). Aborting to avoid duplicates.';
  end if;

  select id into anabella from contacts where workspace_id = ws and name = 'Anabella Guzman';
  select id into rodolfo  from contacts where workspace_id = ws and name = 'Rodolfo Gerstl';
  if anabella is null then raise exception 'Anabella Guzman not found — aborting.'; end if;

  ---------------------------------------------------------------------------
  -- NEW CONTACTS
  ---------------------------------------------------------------------------
  -- Livio Leopardi — tour operator pitched by Rodolfo; parked for now.
  insert into contacts (workspace_id, name, type, organization, relationship_type, created_by, intro_chain_from_contact_id, intro_chain_from_text)
    values (ws, 'Livio Leopardi', 'person', 'Delfino Tours', 'lead', tomas, rodolfo,
            case when rodolfo is null then 'Connected by Rodolfo Gerstl' else null end)
    returning id into livio;
  insert into contact_channels (contact_id, kind, value, is_primary) values
    (livio, 'phone',    '+584143081343', true),
    (livio, 'whatsapp', '+584143081343', false);

  -- Alberto Afiuni — Anabella's contact, VAV education & community pillar.
  insert into contacts (workspace_id, name, type, relationship_type, created_by, intro_chain_from_contact_id)
    values (ws, 'Alberto Afiuni', 'person', 'prospect', tomas, anabella)
    returning id into alberto;
  insert into contact_channels (contact_id, kind, value, is_primary) values
    (alberto, 'domain', 'https://ve.linkedin.com/in/alberto-afiuni-95871868', true);

  -- La Cabra Verde VZLA — Charles's aunt; potential creator/affiliate for VAV.
  insert into contacts (workspace_id, name, type, organization, relationship_type, created_by, intro_chain_from_text)
    values (ws, 'La Cabra Verde VZLA', 'person', 'La Cabra Verde', 'prospect', tomas, 'Charles''s aunt (his dad''s older sister)')
    returning id into cabra;
  insert into contact_channels (contact_id, kind, value, is_primary) values
    (cabra, 'instagram', 'https://www.instagram.com/lacabraverdevzla', true);

  ---------------------------------------------------------------------------
  -- LINK CONTACTS → VAV
  ---------------------------------------------------------------------------
  insert into project_contacts (project_id, contact_id, role) values
    (p_vav, livio,    'lead'),
    (p_vav, alberto,  'education & community'),
    (p_vav, cabra,    'creator / affiliate'),
    (p_vav, anabella, 'strategic partner')
  on conflict (project_id, contact_id) do nothing;

  ---------------------------------------------------------------------------
  -- TOUCHES (updates on the contact records)
  ---------------------------------------------------------------------------
  -- Anabella — full reunión note + additional takeaways.
  insert into touches (workspace_id, contact_id, project_id, channel, body, created_by) values
    (ws, anabella, p_vav, 'meeting', $tx$Reunión — Anabella Guzmán

• Especialista en armar logísticas complejas para llevar turistas a destinos remotos y sagrados de Venezuela. La excelencia es su estándar no negociable.
• La infraestructura del país está completamente destruida — Starlink se perfila como la solución más viable para conectividad en zonas remotas y comunidades indígenas.
• La cultura local y la música son vehículos clave para comunicarse y conectar con las comunidades a lo largo del país.
• Impronta Venezuela — organización de organizaciones con presencia nacional. Potencial aliado estratégico para escalar el impacto comunitario de VAV.
• Alberto Afiuni — contacto realineado con el pilar de educación y comunidad de VAV.
• Anabella expondrá en noviembre en una conferencia a la que nos invitó. Hay que pedir info — oportunidad concreta de visibilidad y posicionamiento para VAV ante una audiencia de alto perfil.
• Estamos completamente alineados en visión — comunidad, excelencia, cultura local y turismo sostenible son valores compartidos.
• Anabella nos introducirá al Círculo de Excelencia — red de posadas de alto nivel a lo largo de Venezuela. Acceso directo a inventario de calidad para CaneyCloud y VAV. 🔥

URGENTE — Anabella tiene reunión el lunes con contactos que nos interesan directamente. Necesitamos tener listo antes del lunes:
- Vision deck / pitch deck listo para enviar.
- Narrativa de educación y comunidad clara, pulida y convincente.

— Additional takeaways / open questions (reviewing in detail) —
1) ¿Es la infraestructura el mayor obstáculo ahora mismo? ¿Tiene una idea clara de qué se requiere para llevarla a un estado funcional?
2) Starlink — ¿qué podemos hacer con Starlink y cómo lo incorporamos a nuestra oferta? El concepto de conectividad es enorme:
   - https://www.share.inc/  (lo que mi amigo está construyendo en Kenia)
   - https://thempwr.com/    (lo que mi tío está por lanzar en México)
3) ¿Cómo aseguramos que nuestra solución tenga impacto amplio más allá de la eficiencia operativa del dueño de la posada? La misión debe expandirse para dar acceso a la industria del turismo a educación, conocimiento, tecnología, etc.
4) Necesitamos REALMENTE alinearnos en la narrativa de educación y comunidad.$tx$, tomas);

  -- Livio — context note.
  insert into touches (workspace_id, contact_id, project_id, channel, body, created_by) values
    (ws, livio, p_vav, 'manual', $tx$Conectado por Rodolfo Gerstl. Dueño de Delfino Tours (operador turístico; nacionalidad por confirmar — la nota dice chileno / colombiano). Nos quiso vender Cloudbeds (PMS) por $150. El equipo se alineó en ponerlo en pausa por ahora.$tx$, tomas);

  -- Alberto — context note.
  insert into touches (workspace_id, contact_id, project_id, channel, body, created_by) values
    (ws, alberto, p_vav, 'manual', $tx$Contacto de Anabella Guzmán. Realineado con el pilar de educación y comunidad de VAV. LinkedIn: https://ve.linkedin.com/in/alberto-afiuni-95871868$tx$, tomas);

  -- La Cabra Verde — context note.
  insert into touches (workspace_id, contact_id, project_id, channel, body, created_by) values
    (ws, cabra, p_vav, 'manual', $tx$Tía de Charles (hermana mayor de su papá). IG: @lacabraverdevzla. Dispuesta a hacer un video gratis sobre venir a Venezuela mencionándonos; potencial affiliate link a futuro. Alineado con la misión de VAV.$tx$, tomas);

  ---------------------------------------------------------------------------
  -- ACTION ITEMS (pulled from the Anabella call + explicit list)
  ---------------------------------------------------------------------------
  insert into action_items (workspace_id, title, description, status, due_date, priority, project_id, contact_id, created_by, assignee_user_id) values
    (ws, 'VAV: Vision/pitch deck ready to send', 'For Anabella''s Monday meeting with contacts of interest. Needed before Mon.', 'open', date '2026-06-08', 'now',  p_vav, anabella, tomas, tomas),
    (ws, 'VAV: Polish education & community narrative', 'Clear, polished, convincing. Aligns with takeaway #4 — needed before Mon.', 'open', date '2026-06-08', 'now',  p_vav, null,     tomas, tomas),
    (ws, 'Ask Anabella for info on her November conference', 'She invited us — concrete visibility/positioning slot for VAV with a high-profile audience.', 'open', null, 'next', p_vav, anabella, tomas, tomas),
    (ws, 'Follow up on Círculo de Excelencia intro', 'High-end posada network — direct access to quality inventory for CaneyCloud + VAV.', 'open', null, 'next', p_vav, anabella, tomas, tomas),
    (ws, 'Connect with Alberto Afiuni (education & community)', 'Anabella''s contact, realigned with VAV''s education & community pillar.', 'open', null, 'next', p_vav, alberto, tomas, tomas),
    (ws, 'Explore Impronta Venezuela as a strategic ally', 'Organization-of-organizations with national presence — scale VAV''s community impact.', 'open', null, 'later', p_vav, null, tomas, tomas),
    (ws, 'Discuss US/VZ entity structure with lawyer', 'Decide entity structure across US and Venezuela.', 'open', null, 'next', null, null, tomas, tomas);

  ---------------------------------------------------------------------------
  -- CONTENT IDEAS repository (one doc per project, marketing category)
  ---------------------------------------------------------------------------
  insert into project_links (workspace_id, project_id, kind, category, label, description, created_by)
    values (ws, p_vav, 'note', 'marketing', 'Content Ideas', 'Running repository of content ideas for VAV.', tomas)
    returning id into doc_vav;
  insert into project_doc_contents (link_id, workspace_id, text, updated_by) values
    (doc_vav, ws, $md$# VAV — Content Ideas

A running repository of content ideas for Vamos a Venezuela.

## Reels / video
- [IG reel reference](https://www.instagram.com/reel/DZIxLglS3SC/) — saved as format/inspiration reference.
- **La Cabra Verde VZLA** (Charles''s aunt · @lacabraverdevzla) — video about coming to Venezuela mentioning VAV (free now / affiliate link later). Aligned with the VAV mission.
$md$, tomas);

  insert into project_links (workspace_id, project_id, kind, category, label, description, created_by)
    values (ws, p_caney, 'note', 'marketing', 'Content Ideas', 'Running repository of content ideas for CaneyCloud.', tomas)
    returning id into doc_caney;
  insert into project_doc_contents (link_id, workspace_id, text, updated_by) values
    (doc_caney, ws, $md$# CaneyCloud — Content Ideas

A running repository of content ideas for CaneyCloud.

_(Add ideas here.)_
$md$, tomas);

  raise notice 'Notes batch 1: +3 contacts (Livio, Alberto, La Cabra Verde), 4 touches, 7 action items, 2 Content Ideas docs.';
end $batch$;
