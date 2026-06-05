-- AGB-CRM · 2026-Q2 starter data (draft — edit owners/targets/dates in the app)
-- Wired to the real workspace, members and projects. Safe to run ONCE:
-- it aborts if it detects it already ran (guard on a marker objective).
--
-- Run:  psql "$DATABASE_URL_with_sslmode" -f scripts/seed-real-q2.sql
--
-- Members:  Tomas (owner) · Jose (Joe) · AGB (Arevalo) · Charles
-- Owners are a first guess — reassign freely in /priorities, /work, /meetings.

do $$
declare
  ws       uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  tomas    uuid := 'a408e392-1337-4cb3-acc5-f8c1881f1522';
  jose     uuid := '11111111-2222-3333-4444-100000000001';
  agb      uuid := '1e5b4220-cdb2-47b8-85bb-08495703c37e';
  charles  uuid := 'a61b938a-5dfb-4e3c-83f3-3508933022b4';
  -- projects
  p_vav    uuid := '59a04990-af7b-4c8d-ba8f-6afcd541d156';
  p_stays  uuid := '16f58478-af2f-4543-b4f6-a6568169b807';
  p_resto  uuid := 'de31a77f-ad0b-49ec-b131-80d4874d9d8d';
  p_wa     uuid := 'e4cdc474-80fa-4406-b514-65c4f1dc2690';
  p_ruta   uuid := 'e6173ffd-a7ae-4661-8944-234738a51de8';
  p_crm    uuid := 'b4e08089-4002-4aff-82d0-f68300df3c3a';
  p_forma  uuid := '90356686-1e06-4340-82fa-96c7a1a0f419';
  p_caney  uuid := '953ff0d5-177e-4826-8bb2-ab917b170d2a';
  obj      uuid;
begin
  if exists (select 1 from objectives where workspace_id = ws and title = 'Launch VAV — Vamos a Venezuela to the public') then
    raise exception 'Already seeded (found the VAV launch objective). Aborting to avoid duplicates.';
  end if;

  ---------------------------------------------------------------------------
  -- OBJECTIVES + KEY RESULTS  (2026-Q2)
  ---------------------------------------------------------------------------
  insert into objectives (workspace_id, title, description, owner_id, quarter, status, sort_order, created_by)
    values (ws, 'Launch VAV — Vamos a Venezuela to the public', 'Lift the countdown gate and start taking real bookings.', jose, '2026-Q2', 'on_track', 1, tomas)
    returning id into obj;
  insert into key_results (workspace_id, objective_id, title, owner_id, start_value, target, current, unit, direction, on_scorecard, sort_order) values
    (ws, obj, 'Providers onboarded',  jose, 12, 50, 12, 'providers', 'higher', true, 1),
    (ws, obj, 'Public launch live',   jose, 0,  1,  0,  'go-live',   'higher', true, 2),
    (ws, obj, 'First real bookings',  jose, 0,  25, 0,  'bookings',  'higher', true, 3);

  insert into objectives (workspace_id, title, description, owner_id, quarter, status, sort_order, created_by)
    values (ws, 'Ship CaneyCloud PMS to paying posadas', 'Move from build to first revenue with real posada operators.', tomas, '2026-Q2', 'on_track', 2, tomas)
    returning id into obj;
  insert into key_results (workspace_id, objective_id, title, owner_id, start_value, target, current, unit, direction, on_scorecard, sort_order) values
    (ws, obj, 'Posadas live in production', tomas, 0,  10,   0,  'posadas', 'higher', true, 1),
    (ws, obj, 'Feature completion',         tomas, 59, 80,   59, '%',       'higher', true, 2),
    (ws, obj, 'Recurring revenue (MRR)',    tomas, 0,  5000, 0,  'USD',     'higher', true, 3);

  insert into objectives (workspace_id, title, description, owner_id, quarter, status, sort_order, created_by)
    values (ws, 'Stand up the restaurant vertical', 'Wave 5 productionization and first pilot restaurants live.', tomas, '2026-Q2', 'on_track', 3, tomas)
    returning id into obj;
  insert into key_results (workspace_id, objective_id, title, owner_id, start_value, target, current, unit, direction, on_scorecard, sort_order) values
    (ws, obj, 'Wave 5 productionization', tomas, 0, 100, 0, '%',           'higher', true, 1),
    (ws, obj, 'Pilot restaurants live',   tomas, 0, 5,   0, 'restaurants', 'higher', true, 2);

  insert into objectives (workspace_id, title, description, owner_id, quarter, status, sort_order, created_by)
    values (ws, 'Build the BD & capital pipeline', 'Convert the network into qualified intros and live conversations.', tomas, '2026-Q2', 'on_track', 4, tomas)
    returning id into obj;
  insert into key_results (workspace_id, objective_id, title, owner_id, start_value, target, current, unit, direction, on_scorecard, sort_order) values
    (ws, obj, 'Qualified intros',         tomas, 0, 20, 0, 'intros',        'higher', true, 1),
    (ws, obj, 'Active conversations',     tomas, 0, 8,  0, 'conversations', 'higher', true, 2);

  ---------------------------------------------------------------------------
  -- TASKS (milestones) on real projects
  ---------------------------------------------------------------------------
  insert into milestones (workspace_id, project_id, title, due_date, created_by, status, priority, assignee_user_id) values
    -- VAV
    (ws, p_vav,  'Lift countdown gate & flip site to public', date '2026-06-06', tomas, 'in_progress', 'now',  jose),
    (ws, p_vav,  'Migrate JSON seed data → Postgres',          date '2026-06-13', tomas, 'pending',     'now',  tomas),
    (ws, p_vav,  'Onboard next 10 IG-seeded providers',        date '2026-06-20', tomas, 'pending',     'next', jose),
    -- CaneyCloud PMS
    (ws, p_caney,'Resolve alembic multi-head convergence',     date '2026-06-06', tomas, 'in_progress', 'now',  tomas),
    (ws, p_caney,'Ship Wave B accounting to staging',          date '2026-06-13', tomas, 'pending',     'next', tomas),
    (ws, p_caney,'First posada production onboarding',          date '2026-06-20', tomas, 'pending',     'next', tomas),
    -- Restaurants
    (ws, p_resto,'Kick off Wave 5 productionization (OPS-SUITE)', date '2026-06-16', tomas, 'pending',  'next', tomas),
    (ws, p_resto,'Recruit 5 pilot restaurants',                date '2026-06-27', tomas, 'pending',     'later', tomas),
    -- WA Concierge
    (ws, p_wa,   'Wire GROQ + DEEPGRAM keys to production',     date '2026-06-09', tomas, 'pending',     'now',  tomas),
    (ws, p_wa,   'End-to-end booking via WhatsApp test',        date '2026-06-13', tomas, 'pending',     'next', tomas),
    -- AGB-CRM
    (ws, p_crm,  'AGB-000A — finalize Supabase prod wiring',    date '2026-06-10', tomas, 'pending',     'next', tomas),
    -- FormaVZ
    (ws, p_forma,'Author first 5 curriculum modules',           date '2026-06-20', tomas, 'pending',     'later', tomas),
    -- RUTA
    (ws, p_ruta, 'Finish 13→9 section rewrite of v1 site',      date '2026-06-18', tomas, 'pending',     'later', tomas);

  ---------------------------------------------------------------------------
  -- MEETINGS this week / early next week
  ---------------------------------------------------------------------------
  insert into meetings (workspace_id, title, scheduled_at, type, agenda, linked_project_id, source, created_by) values
    (ws, 'Tomas ↔ Jose — VAV go-live check', timestamptz '2026-06-05 16:00:00+00', 'one_on_one',
       E'- Countdown gate flip plan\n- Provider onboarding queue\n- Booking flow smoke test', p_vav, 'manual', tomas),
    (ws, 'Weekly Leadership L10', timestamptz '2026-06-08 14:00:00+00', 'group',
       E'- Scorecard review (Q2 KRs)\n- Rock check-in\n- Headlines\n- To-do review\n- IDS: issues', null, 'manual', tomas),
    (ws, 'CaneyCloud — first posada onboarding', timestamptz '2026-06-09 17:00:00+00', 'call',
       E'- Account setup\n- Rooms & rates import\n- Channel manager walkthrough', p_caney, 'manual', tomas),
    (ws, 'Portfolio review with AGB', timestamptz '2026-06-10 15:00:00+00', 'group',
       E'- Q2 objectives status\n- Capital pipeline\n- Decisions needed', null, 'manual', tomas);

  ---------------------------------------------------------------------------
  -- ACTION ITEMS (personal to-dos)
  ---------------------------------------------------------------------------
  insert into action_items (workspace_id, title, status, due_date, priority, project_id, created_by, assignee_user_id) values
    (ws, 'Send AGB the weekly portfolio one-pager',        'open', date '2026-06-06', 'now',  p_crm,   tomas, tomas),
    (ws, 'Approve CaneyCloud Wave B before staging deploy','open', date '2026-06-06', 'now',  p_caney, tomas, tomas),
    (ws, 'Follow up with Marcos Antonio Capote after intro','open',date '2026-06-05', 'next', null,    tomas, tomas),
    (ws, 'Review FormaVZ curriculum outline',              'open', date '2026-06-09', 'later',p_forma, tomas, tomas);

  ---------------------------------------------------------------------------
  -- TOWN HALL kickoff post
  ---------------------------------------------------------------------------
  insert into posts (workspace_id, author_id, body, kind) values
    (ws, tomas,
     E'The CRM is live. 🚀\n\nI seeded our draft 2026-Q2 objectives — VAV public launch, CaneyCloud to paying posadas, the restaurant vertical, and the BD/capital pipeline. Targets and owners are a first pass; tweak them in Priorities. Tasks are on each project, and this week''s meetings (incl. the Weekly L10) are on the calendar.\n\nLet''s run the week from here.',
     'message');

  raise notice 'Seeded 2026-Q2: 4 objectives + 10 KRs, 13 tasks, 4 meetings, 4 action items, 1 Town Hall post.';
end $$;
