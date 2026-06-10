-- Corrective: Projects→LoB restructure drift (root cause of prod digest 4214350264).
--
-- On the live DB, some lob_id columns kept (or were given) a foreign key that
-- references the NEW lighter public.projects table instead of
-- public.lines_of_business. Concretely: partner_shares.lob_id still carries
-- "partner_shares_project_id_fkey" → projects(id), so sharing a doc anchored to
-- a Line of Business into a partner room fails with FK violation 23503 and the
-- partner portal crashes to Next's digest error page.
--
-- This migration is introspection-driven and idempotent: it scans pg_constraint
-- for ANY foreign key on a column named lob_id / source_lob_id that references
-- public.projects, drops it, and re-adds it pointing at
-- public.lines_of_business, preserving the original ON DELETE behavior.
-- Orphan handling: nullable columns get orphans nulled out; the re-added
-- constraint is created NOT VALID then validated in a guarded block so a stray
-- legacy row can never abort the migration (a warning is raised instead).
DO $$
DECLARE
  c RECORD;
  ondelete text;
  orphans bigint;
BEGIN
  IF to_regclass('public.projects') IS NULL
     OR to_regclass('public.lines_of_business') IS NULL THEN
    RAISE NOTICE 'projects / lines_of_business not present — nothing to fix';
    RETURN;
  END IF;

  FOR c IN
    SELECT con.oid          AS conoid,
           con.conname      AS conname,
           rel.relname      AS tbl,
           att.attname      AS col,
           att.attnotnull   AS col_not_null,
           con.confdeltype  AS deltype
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND con.confrelid = 'public.projects'::regclass
      AND cardinality(con.conkey) = 1
      AND att.attname IN ('lob_id', 'source_lob_id')
  LOOP
    ondelete := CASE c.deltype
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      WHEN 'r' THEN 'RESTRICT'
      ELSE 'NO ACTION'
    END;

    RAISE NOTICE 'Re-pointing %.% (%) from projects → lines_of_business (ON DELETE %)',
      c.tbl, c.col, c.conname, ondelete;

    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', c.tbl, c.conname);

    -- Orphans: rows whose lob_id has no match in lines_of_business.
    IF NOT c.col_not_null THEN
      EXECUTE format(
        'UPDATE public.%I t SET %I = NULL
         WHERE t.%I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.lines_of_business l WHERE l.id = t.%I)',
        c.tbl, c.col, c.col, c.col);
      GET DIAGNOSTICS orphans = ROW_COUNT;
      IF orphans > 0 THEN
        RAISE WARNING '%.%: nulled % orphan row(s) with no matching line of business',
          c.tbl, c.col, orphans;
      END IF;
    END IF;

    -- Re-add NOT VALID first so legacy orphans on NOT NULL columns can't abort
    -- the migration; new writes are enforced immediately either way.
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES public.lines_of_business(id) ON DELETE %s NOT VALID',
      c.tbl, c.tbl || '_' || c.col || '_fkey', c.col, ondelete);

    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
        c.tbl, c.tbl || '_' || c.col || '_fkey');
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE WARNING '%.%: constraint left NOT VALID — legacy rows reference missing lines_of_business ids; clean up manually',
        c.tbl, c.col;
    END;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- Second drift class: the newer partner tables shipped "workspace_isolation"
-- RLS policies that reference users.workspace_id — a column that does not
-- exist (it's users.current_workspace_id). The policies are dead today (the
-- app connects as the table owner, bypassing RLS) but they 42703 the moment
-- anything queries these tables through PostgREST, and they give false
-- defense-in-depth. Re-point them at the is_workspace_member() helper the
-- original partner tables use.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'partner_uploads', 'partner_next_steps', 'partner_room_messages',
    'partner_room_items', 'partner_item_comments', 'partner_room_team'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DROP POLICY IF EXISTS "workspace_isolation" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "workspace_isolation" ON public.%I
         FOR ALL TO authenticated
         USING (public.is_workspace_member(workspace_id))
         WITH CHECK (public.is_workspace_member(workspace_id))',
      t);
  END LOOP;
END $$;
