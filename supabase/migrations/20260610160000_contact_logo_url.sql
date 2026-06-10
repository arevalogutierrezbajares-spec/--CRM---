-- Client/company brand logo for co-branded partner rooms. Stored on the contact
-- so it's reusable across every room for that client. URL-based, matching the
-- existing lines_of_business.logo_url convention.
alter table contacts add column if not exists logo_url text;
