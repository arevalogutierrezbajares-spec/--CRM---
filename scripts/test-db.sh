#!/usr/bin/env bash
# Spin up a local Postgres for integration tests, apply schema + seed.
# Idempotent: re-running will reset the data dir + reseed.
#
# Used by:
#   pnpm test:integration
#
# Connect string after setup:
#   postgresql://agb@localhost:54329/agb_test
set -euo pipefail

PG=/opt/homebrew/opt/postgresql@18/bin
DATA=/tmp/agb-pg-data
PORT=54329
LOG=/tmp/agb-pg.log

if [ ! -x "$PG/pg_ctl" ]; then
  echo "Postgres 18 not found at $PG. Install with: brew install postgresql@18"
  exit 1
fi

# Stop any existing instance.
if "$PG/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  echo "Stopping existing instance..."
  "$PG/pg_ctl" -D "$DATA" stop -m fast || true
fi

rm -rf "$DATA"
mkdir -p "$DATA"
"$PG/initdb" -D "$DATA" -U agb --auth=trust --encoding=UTF-8 > /dev/null
"$PG/pg_ctl" -D "$DATA" -l "$LOG" -o "-p $PORT -k /tmp" start
sleep 1

"$PG/psql" -h localhost -p $PORT -U agb -d postgres -c "CREATE DATABASE agb_test;" > /dev/null

export DATABASE_URL="postgresql://agb@localhost:$PORT/agb_test"
# Pin lib/database-url.ts to this URL — without the opt-in it prefers the
# .env.local Supabase URL and db/seed.ts would write to PRODUCTION.
export AGB_INTEGRATION_TEST_DB=1

echo "Applying Drizzle schema..."
./node_modules/.bin/drizzle-kit push --force > /dev/null

echo "Seeding templates + tags..."
./node_modules/.bin/tsx db/seed.ts > /dev/null

echo "Ready. DATABASE_URL=$DATABASE_URL"
