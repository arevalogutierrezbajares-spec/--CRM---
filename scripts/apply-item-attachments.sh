#!/usr/bin/env bash
# Apply the PMO item_attachments migration to the Supabase DB. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
CLEAN="${DBURL%%\?*}?sslmode=require"

echo "→ item_attachments (enum + table + RLS)…"
psql "$CLEAN" -v ON_ERROR_STOP=1 -f supabase/migrations/20260604120000_item_attachments.sql
echo "MIGRATION APPLIED"
