#!/usr/bin/env bash
# Apply the Town Hall migration (posts / mentions / refs / notifications) to
# the Supabase DB. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
CLEAN="${DBURL%%\?*}?sslmode=require"

echo "→ town_hall (posts, post_mentions, post_refs, notifications)…"
psql "$CLEAN" -v ON_ERROR_STOP=1 -f supabase/migrations/20260604130000_town_hall.sql
echo "MIGRATION APPLIED"
