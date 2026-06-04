#!/usr/bin/env bash
# Apply the collaborative-docs + presence migrations to the Supabase DB.
# Additive + idempotent. Reads DATABASE_URL from .env.local, strips the
# Prisma-only ?pgbouncer param, and forces SSL (libpq requirements).
set -euo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
CLEAN="${DBURL%%\?*}?sslmode=require"

echo "→ project_docs (doc enum + project_doc_contents)…"
psql "$CLEAN" -v ON_ERROR_STOP=1 -f supabase/migrations/20260603120000_project_docs.sql

echo "→ user_last_seen…"
psql "$CLEAN" -v ON_ERROR_STOP=1 -f supabase/migrations/20260603130000_user_last_seen.sql

echo "MIGRATIONS APPLIED"
