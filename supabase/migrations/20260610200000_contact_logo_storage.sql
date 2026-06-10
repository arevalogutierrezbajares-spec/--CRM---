-- Support uploaded (not just URL) client logos. When a logo is uploaded, the
-- object path lives here and logo_url points at the public proxy that streams it.
alter table contacts add column if not exists logo_storage_path text;
