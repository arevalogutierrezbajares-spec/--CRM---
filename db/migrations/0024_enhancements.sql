-- Tech Board: product enhancements (CaneyCloud/VAV/CCA/CRM). Idempotent.
CREATE TABLE IF NOT EXISTS enhancements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  product text NOT NULL,
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'idea',
  priority text NOT NULL DEFAULT 'next',
  sort_order integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  source_ref_id text,
  source_label text,
  source_url text,
  linked_initiative_id uuid REFERENCES initiatives(id) ON DELETE SET NULL,
  linked_milestone_id uuid REFERENCES milestones(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS enhancements_ws_product_idx ON enhancements (workspace_id, product);
