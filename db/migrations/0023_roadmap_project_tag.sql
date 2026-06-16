-- Product-line tag on deliverables (milestones): 'caney' | 'vav' | 'all' | null.
-- Distinct from project_id (internal project grouping). Idempotent.
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS project text;
