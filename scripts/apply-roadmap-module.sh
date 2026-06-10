#!/usr/bin/env bash
# Apply the Roadmap Module Wave 1 migration (plan_versions, success_criteria,
# action_items.milestone_id) to the Supabase DB. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

DBURL=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//')
CLEAN="${DBURL%%\?*}?sslmode=require"

echo "→ roadmap_module (plan_versions, initiatives.success_criteria, action_items.milestone_id)…"
psql "$CLEAN" -v ON_ERROR_STOP=1 -f supabase/migrations/20260611100000_roadmap_module.sql
echo "MIGRATION APPLIED"
