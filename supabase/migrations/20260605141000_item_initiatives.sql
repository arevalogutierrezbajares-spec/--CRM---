-- Multi-initiative linking: a task (milestone) or action item can fall under 1+ initiatives.
-- Mirrors the existing initiative_themes / milestone_themes junction pattern.
create table if not exists milestone_initiatives (
  milestone_id  uuid not null references milestones(id)  on delete cascade,
  initiative_id uuid not null references initiatives(id) on delete cascade,
  primary key (milestone_id, initiative_id)
);
create index if not exists milestone_initiatives_initiative_idx on milestone_initiatives(initiative_id);

create table if not exists action_item_initiatives (
  action_item_id uuid not null references action_items(id) on delete cascade,
  initiative_id  uuid not null references initiatives(id)  on delete cascade,
  primary key (action_item_id, initiative_id)
);
create index if not exists action_item_initiatives_initiative_idx on action_item_initiatives(initiative_id);

-- Backfill milestone_initiatives from the existing single milestones.initiative_id.
insert into milestone_initiatives (milestone_id, initiative_id)
  select id, initiative_id from milestones where initiative_id is not null
  on conflict do nothing;
