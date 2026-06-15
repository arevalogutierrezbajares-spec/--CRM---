-- Manual drag-to-reorder for the roadmap bulk-edit outline.
-- LoBs and initiatives (milestones) gain a sortOrder; deliverables already
-- have milestones.order. Idempotent so it can re-run safely.
ALTER TABLE lines_of_business ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE initiatives ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
