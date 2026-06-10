-- Corrective: the Projects→LoB rename (20260607160000) renamed project_id→lob_id
-- on every anchored table EXCEPT partner_shares on the live DB, so the schema's
-- `lob_id` column diverged from the table's `project_id`, breaking every
-- Partner Access query ("column lob_id does not exist"). Rename it to match.
-- Idempotent: only acts when the old column is present and the new one is not.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_shares' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partner_shares' AND column_name = 'lob_id'
  ) THEN
    ALTER TABLE partner_shares RENAME COLUMN project_id TO lob_id;
  END IF;
END $$;
