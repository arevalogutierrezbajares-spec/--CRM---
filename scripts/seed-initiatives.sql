-- AGB-CRM · Seed starter initiatives + link the existing Q2 tasks (milestones) to them.
-- Guarded: aborts if "VAV Public Launch" already exists. Run ONCE.

do $i$
declare
  ws       uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  tomas    uuid := 'a408e392-1337-4cb3-acc5-f8c1881f1522';
  jose     uuid := '11111111-2222-3333-4444-100000000001';
  p_vav    uuid := '59a04990-af7b-4c8d-ba8f-6afcd541d156';
  p_caney  uuid := '953ff0d5-177e-4826-8bb2-ab917b170d2a';
  p_resto  uuid := 'de31a77f-ad0b-49ec-b131-80d4874d9d8d';
  p_wa     uuid := 'e4cdc474-80fa-4406-b514-65c4f1dc2690';
  i_vav    uuid;
  i_caney  uuid;
  i_resto  uuid;
  i_bd     uuid;
begin
  if exists (select 1 from initiatives where workspace_id = ws and title = 'VAV Public Launch') then
    raise exception 'Already seeded (VAV Public Launch exists). Aborting.';
  end if;

  insert into initiatives (workspace_id, project_id, title, goal, status, priority, owner_user_id, target_end_date, created_by)
    values (ws, p_vav, 'VAV Public Launch', 'Lift the gate and take real bookings.', 'active', 'now', jose, date '2026-07-04', tomas)
    returning id into i_vav;
  insert into initiatives (workspace_id, project_id, title, goal, status, priority, owner_user_id, target_end_date, created_by)
    values (ws, p_caney, 'CaneyCloud → Paying Posadas', '10 beta posadas live and testing.', 'active', 'now', tomas, date '2026-07-04', tomas)
    returning id into i_caney;
  insert into initiatives (workspace_id, project_id, title, goal, status, priority, owner_user_id, created_by)
    values (ws, p_resto, 'Restaurant Vertical', 'Stand up CaneyRestaurant + first pilots.', 'active', 'next', tomas, tomas)
    returning id into i_resto;
  insert into initiatives (workspace_id, title, goal, status, priority, owner_user_id, created_by)
    values (ws, 'BD & Capital Pipeline', 'Convert the network into qualified intros + live conversations.', 'active', 'next', tomas, tomas)
    returning id into i_bd;

  -- Link existing Q2 milestones to initiatives by their project, + set the "primary" single-link.
  -- VAV tasks → VAV Public Launch
  insert into milestone_initiatives (milestone_id, initiative_id)
    select m.id, i_vav from milestones m join projects p on p.id=m.project_id
    where p.workspace_id=ws and m.project_id = p_vav on conflict do nothing;
  update milestones set initiative_id = i_vav where project_id = p_vav and initiative_id is null;

  -- CaneyCloud + WA Concierge tasks → CaneyCloud → Paying Posadas
  insert into milestone_initiatives (milestone_id, initiative_id)
    select m.id, i_caney from milestones m
    where m.workspace_id=ws and m.project_id in (p_caney, p_wa) on conflict do nothing;
  update milestones set initiative_id = i_caney where project_id in (p_caney, p_wa) and initiative_id is null;

  -- CaneyRestaurant tasks → Restaurant Vertical
  insert into milestone_initiatives (milestone_id, initiative_id)
    select m.id, i_resto from milestones m
    where m.workspace_id=ws and m.project_id = p_resto on conflict do nothing;
  update milestones set initiative_id = i_resto where project_id = p_resto and initiative_id is null;

  raise notice 'Seeded 4 initiatives + linked Q2 milestones (VAV/CaneyCloud+WA/Restaurant).';
end $i$;
