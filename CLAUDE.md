# AGB-CRM

Internal chief-of-staff CRM. Next.js (App Router) + Drizzle + Supabase, deployed on Vercel at x.caneycloud.com.

## Database Migrations — ONE rule

**Never apply migration SQL to the live DB by hand** (psql, Supabase MCP `apply_migration`/`execute_sql`, dashboard SQL editor, or one-off `scripts/apply-*.sh` scripts). Hand-applies leave the migration ledger (`supabase_migrations.schema_migrations`) blind, so nothing detects when a migration is missing. This caused three production drift bugs: the `partner_shares.lob_id` FK pointing at the wrong table, six broken RLS policies, and the email-module tables missing entirely (email-sync cron 500ing every 5 minutes).

The single apply + record path:

```bash
scripts/db-migrate.sh            # dry run — list pending migrations
scripts/db-migrate.sh --apply    # apply pending migrations AND record them in the ledger
scripts/db-migrate.sh --check    # drift check (exit 1 if live is behind) — use before deploys
```

It wraps `supabase db push --db-url` using `DATABASE_URL` from `.env.local` (normalized to the session pooler — the transaction pooler on port 6543 breaks the CLI). The ledger was backfilled to match reality on 2026-06-11 (49/49 recorded).

Rules for new migrations:

- One file in `supabase/migrations/`, named `YYYYMMDDHHMMSS_description.sql`. Never reuse a version timestamp — `version` is the ledger's primary key, and the script refuses to run if duplicates exist.
- Apply only via `scripts/db-migrate.sh --apply`. Live applies need operator approval.
- If a migration's version sorts before the newest applied one, pass `--include-all` deliberately.
- The legacy `scripts/apply-*.sh` / `apply-*.mjs` scripts are historical artifacts — do not copy that pattern.

## Commands

```bash
npm run dev          # dev server
npx vitest run       # unit tests
npx tsc --noEmit     # typecheck
pnpm brain:build     # regenerate portfolio graph (includes docs corpus)
pnpm brain:check     # fail if graph stale / SHA drift
```

## THE BRAIN + documentation (agents)

See **[AGENTS.md](./AGENTS.md)** for Investigation / Remediation modes and tool table.

The living architecture map lives at `/brain`. Structure and **markdown docs under `docs/`** are derived into `lib/brain/generated/brain-graph.json` by `pnpm brain:build` (no LLM in the pipeline).

| Resource | Path |
|----------|------|
| Agent docs index | `docs/llms.txt` |
| Ops runbook | `docs/brain-ops.md` |
| Pure APIs | `lib/brain/search.ts`, `neighborhood.ts`, `doc-get.ts`, `rca-pack.ts` |
| Agent tools | `brain_search`, `brain_neighborhood`, `brain_doc_get`, `brain_freshness`, `brain_rca_pack`, `brain_remediation_gate`, `brain_correlate_error` |

### RCA (mandatory tool order)

1. `brain_search` / `brain_rca_pack`
2. `brain_neighborhood` on architecture ids
3. `brain_doc_get` for docs
4. Cite node ids + paths; verify before building if empty


