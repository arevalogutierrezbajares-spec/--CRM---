-- Home countdown: one workspace-wide "big milestone" the Home clock counts down to.
-- Edited from the workspace settings page; rendered as the 3rd top-row widget.
alter table workspaces
  add column if not exists countdown_title text,
  add column if not exists countdown_date date,
  add column if not exists countdown_subpoints jsonb not null default '[]'::jsonb;

-- Seed the current workspace's milestone (Jul 4 — VAV ready, CaneyCloud 10 beta).
update workspaces set
  countdown_title = coalesce(countdown_title, 'Launch — Jul 4'),
  countdown_date  = coalesce(countdown_date, date '2026-07-04'),
  countdown_subpoints = case
    when countdown_subpoints = '[]'::jsonb
    then '["VAV ready", "CaneyCloud: 10 beta clients testing"]'::jsonb
    else countdown_subpoints end
where id = '11111111-2222-3333-4444-aaaaaaaaaaa1';
