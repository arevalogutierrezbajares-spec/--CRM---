-- FR-DOC-1/4/5/9/11 — extend project_links with ownership + audit columns,
-- add project_link_audits table, and define RLS policies for both.
-- Mirrors what was already applied via direct SQL on 2026-05-27. Idempotent.
-- Extends 20260526120000_rls_owner_policies.sql.

-- ─── enum + columns on project_links ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE project_link_kind AS ENUM ('note', 'link', 'file');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE project_links
  ADD COLUMN IF NOT EXISTS kind project_link_kind NOT NULL DEFAULT 'link',
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes integer,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

-- Tag existing url=null seed rows as notes so they continue to render but
-- don't pretend to be clickable links.
UPDATE project_links SET kind = 'note' WHERE url IS NULL AND kind = 'link';

ALTER TABLE project_links DROP CONSTRAINT IF EXISTS link_or_file_consistency;
ALTER TABLE project_links ADD CONSTRAINT link_or_file_consistency CHECK (
  (kind = 'note' AND storage_path IS NULL) OR
  (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL) OR
  (kind = 'file' AND storage_path IS NOT NULL)
);

-- ─── project_link_audits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_link_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  link_id uuid NOT NULL, -- intentionally NOT a foreign key — survives link deletes
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL, -- 'create' | 'update' | 'delete' | 'file_missing' | 'storage_orphan'
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_link_audits_link_id_idx ON project_link_audits(link_id);
CREATE INDEX IF NOT EXISTS project_link_audits_workspace_id_idx ON project_link_audits(workspace_id);

-- ─── RLS policies (NFR-DOC-SEC-1 — defense in depth) ────────────────────────
ALTER TABLE project_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_link_audits ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so this migration is fully re-runnable
DROP POLICY IF EXISTS project_links_select ON project_links;
DROP POLICY IF EXISTS project_links_insert ON project_links;
DROP POLICY IF EXISTS project_links_update ON project_links;
DROP POLICY IF EXISTS project_links_delete ON project_links;
DROP POLICY IF EXISTS project_link_audits_select ON project_link_audits;
DROP POLICY IF EXISTS project_link_audits_insert ON project_link_audits;

-- SELECT: any workspace member can read
CREATE POLICY project_links_select ON project_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_links.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- INSERT: any workspace member with role member|admin|owner can create
CREATE POLICY project_links_insert ON project_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_links.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );

-- UPDATE: owners/admins update anything; members update only their own rows
CREATE POLICY project_links_update ON project_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_links.workspace_id
        AND wm.user_id = auth.uid()
        AND (
          wm.role IN ('owner', 'admin')
          OR project_links.created_by = auth.uid()
        )
    )
  );

-- DELETE: same matrix as update
CREATE POLICY project_links_delete ON project_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_links.workspace_id
        AND wm.user_id = auth.uid()
        AND (
          wm.role IN ('owner', 'admin')
          OR project_links.created_by = auth.uid()
        )
    )
  );

-- Audit log: members read their workspace's audits; inserts allowed for any
-- workspace member (the server actions are the only legitimate writers).
CREATE POLICY project_link_audits_select ON project_link_audits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_link_audits.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY project_link_audits_insert ON project_link_audits
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_link_audits.workspace_id
        AND wm.user_id = auth.uid()
    )
  );
