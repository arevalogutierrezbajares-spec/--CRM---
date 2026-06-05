-- Priorities: allow an objective to be owned by "Everyone" (the whole team)
-- instead of a single member. owner_all=true ⇒ owner_id is null + UI shows "Everyone".
alter table objectives add column if not exists owner_all boolean not null default false;
