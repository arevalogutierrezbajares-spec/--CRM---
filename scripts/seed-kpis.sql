-- Seed the 3 headline KPIs as Key Results (so they live in Priorities AND the
-- Town Hall KPI strip). Guarded: aborts if the CaneyCloud beta KPI exists.
do $k$
declare
  ws       uuid := '11111111-2222-3333-4444-aaaaaaaaaaa1';
  o_caney  uuid;
  o_vav    uuid;
  o_bd     uuid;
begin
  if exists (select 1 from key_results where workspace_id = ws and is_kpi and title like 'Beta customers%') then
    raise exception 'Already seeded KPIs. Aborting.';
  end if;
  select id into o_caney from objectives where workspace_id = ws and title = 'Ship CaneyCloud PMS to paying posadas';
  select id into o_vav   from objectives where workspace_id = ws and title = 'Launch VAV — Vamos a Venezuela to the public';
  select id into o_bd    from objectives where workspace_id = ws and title = 'Build the BD & capital pipeline';
  if o_caney is null or o_vav is null or o_bd is null then
    raise exception 'Expected Q2 objectives not found (caney/vav/bd).';
  end if;

  insert into key_results (workspace_id, objective_id, title, start_value, target, current, unit, direction, on_scorecard, is_kpi, sort_order) values
    (ws, o_caney, 'Beta customers (by Jul 4)', 0, 10, 0, 'customers',   'higher', true, true, 10),
    (ws, o_vav,   'VAV soft launch',            0, 1,  0, null,          'higher', true, true, 11),
    (ws, o_bd,    'Influencers in pipeline',    0, 5,  0, 'influencers', 'higher', true, true, 12);

  raise notice 'Seeded 3 KPI key results (CaneyCloud beta / VAV soft launch / influencers).';
end $k$;
