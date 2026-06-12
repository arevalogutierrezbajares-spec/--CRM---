#!/usr/bin/env bash
# db-migrate.sh — THE single path for applying migrations to the live DB.
#
# Wraps `supabase db push`, which both runs the SQL and records each version
# in supabase_migrations.schema_migrations. Never apply migration SQL by hand
# (psql / MCP apply / one-off apply-*.sh scripts): the ledger stays blind and
# drift is undetectable. That habit caused three prod bugs in this repo
# (partner_shares rename, broken RLS policies, missing email tables).
#
# Usage:
#   scripts/db-migrate.sh            # dry run — list pending migrations
#   scripts/db-migrate.sh --apply    # apply + record pending migrations
#   scripts/db-migrate.sh --check    # drift check, exit 1 if live is behind
#
# Extra flags are forwarded to `supabase db push` (e.g. --include-all to
# apply a migration whose version sorts before the newest applied one).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "error: .env.local not found (needs DATABASE_URL)" >&2
  exit 1
fi

DB_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '"')
# Strip the pgbouncer param and switch the transaction pooler (6543) to the
# session pooler (5432) — transaction mode breaks the CLI's prepared statements.
DB_URL=$(printf '%s' "$DB_URL" | sed 's/[?&]pgbouncer=[^&]*//; s/?$//; s/:6543/:5432/')

# Duplicate version numbers silently break the ledger (version is its PK).
dupes=$(ls supabase/migrations/*.sql | sed -E 's|.*/([0-9]+)_.*|\1|' | sort | uniq -d)
if [[ -n "$dupes" ]]; then
  echo "error: duplicate migration versions: $dupes" >&2
  echo "rename one of each pair before applying." >&2
  exit 1
fi

mode="${1:---dry-run}"
[[ $# -gt 0 ]] && shift

case "$mode" in
  --apply)
    exec supabase db push --db-url "$DB_URL" --yes "$@"
    ;;
  --check)
    out=$(supabase db push --db-url "$DB_URL" --dry-run --include-all "$@" 2>&1) || { echo "$out"; exit 1; }
    echo "$out"
    if echo "$out" | grep -q "Remote database is up to date"; then
      exit 0
    fi
    echo "DRIFT: live DB is missing migrations listed above. Run scripts/db-migrate.sh --apply" >&2
    exit 1
    ;;
  --dry-run)
    exec supabase db push --db-url "$DB_URL" --dry-run --include-all "$@"
    ;;
  *)
    echo "usage: scripts/db-migrate.sh [--apply|--check|--dry-run] [supabase db push flags]" >&2
    exit 1
    ;;
esac
