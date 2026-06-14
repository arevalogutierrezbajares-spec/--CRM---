-- Backfill: convert legacy free-text contact.organization into structured
-- org-type contacts + primaryOrgId links, so every "org" is a single navigable
-- record (and people show up in their org's Team list).
--
-- Safe to re-run: step 1 only inserts orgs that don't already exist; step 2 only
-- links people whose primary_org_id is still NULL. The free-text `organization`
-- column is left intact as a harmless fallback (the UI prefers the structured
-- link) — no data is destroyed.
--
-- DO NOT hand-apply. Run via: scripts/db-migrate.sh --apply (operator-approved).

BEGIN;

-- 1. Create a missing org-type contact for each distinct free-text organization
--    among people who aren't linked yet and have no name-matching org already.
--    The new org inherits the person's created_by (created_by is NOT NULL).
INSERT INTO contacts (workspace_id, name, type, relationship_type, created_by)
SELECT DISTINCT ON (p.workspace_id, lower(btrim(p.organization)))
  p.workspace_id,
  btrim(p.organization),
  'org',
  'partner',
  p.created_by
FROM contacts p
WHERE p.type = 'person'
  AND p.primary_org_id IS NULL
  AND p.organization IS NOT NULL
  AND btrim(p.organization) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contacts o
    WHERE o.workspace_id = p.workspace_id
      AND o.type = 'org'
      AND lower(o.name) = lower(btrim(p.organization))
  )
ORDER BY p.workspace_id, lower(btrim(p.organization)), p.created_at;

-- 2. Link each person to the org contact whose name matches their free text.
UPDATE contacts p
SET primary_org_id = o.id,
    updated_at = now()
FROM contacts o
WHERE p.type = 'person'
  AND p.primary_org_id IS NULL
  AND p.organization IS NOT NULL
  AND btrim(p.organization) <> ''
  AND o.workspace_id = p.workspace_id
  AND o.type = 'org'
  AND lower(o.name) = lower(btrim(p.organization));

COMMIT;
