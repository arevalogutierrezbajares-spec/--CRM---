-- NIGO — the AI teammate. A system user + workspace member so @NIGO resolves in
-- the composer and NIGO can author replies in Town Hall.
insert into users (id, email, display_name, timezone)
  values ('a1100000-0000-4000-8000-000000000001', 'nigo@agb.local', 'NIGO', 'America/New_York')
  on conflict (id) do nothing;

insert into workspace_members (workspace_id, user_id, role)
  values ('11111111-2222-3333-4444-aaaaaaaaaaa1', 'a1100000-0000-4000-8000-000000000001', 'member')
  on conflict do nothing;
