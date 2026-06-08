-- Fix: the project_docs feature (migration 20260603120000) added the 'doc' enum
-- value + project_doc_contents table, but never extended link_or_file_consistency
-- to permit kind='doc'. As a result createProjectDoc() fails the CHECK in prod.
-- Broaden the constraint to allow doc rows (no url, no storage_path). Additive
-- and safe — it only widens an allow-constraint; existing rows are unaffected.
ALTER TABLE project_links DROP CONSTRAINT IF EXISTS link_or_file_consistency;
ALTER TABLE project_links ADD CONSTRAINT link_or_file_consistency CHECK (
  (kind = 'note' AND storage_path IS NULL) OR
  (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL) OR
  (kind = 'file' AND storage_path IS NOT NULL) OR
  (kind = 'doc'  AND url IS NULL AND storage_path IS NULL)
);
