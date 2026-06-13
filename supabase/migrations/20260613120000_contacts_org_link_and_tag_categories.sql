-- Contacts: structured link from a person to their organization (an org-type
-- contact). The column already exists; this adds the self-FK + index. Deleting
-- an org nulls the link rather than cascading, so linked people survive.
alter table contacts
  add constraint contacts_primary_org_id_fkey
  foreign key (primary_org_id) references contacts(id) on delete set null;

create index if not exists contacts_primary_org_id_idx on contacts(primary_org_id);

-- Tags: optional category for grouping the picker (kind stays for the
-- venture/custom distinction the VenturePillBar relies on).
alter table tags add column if not exists category text;
