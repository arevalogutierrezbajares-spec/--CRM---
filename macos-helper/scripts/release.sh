#!/usr/bin/env bash
# release.sh — build, sign, zip, and PUBLISH AGB AI (macOS helper) so
# workspace members can download it from the CRM's /capture page.
#
#   bash macos-helper/scripts/release.sh [version] [notes]
#
# Defaults version to the date if omitted. Requires the CRM's .env.local
# (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) for the upload.
set -euo pipefail

HELPER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRM_DIR="$(cd "$HELPER_DIR/.." && pwd)"
VERSION="${1:-$(date +%Y.%m.%d)}"
NOTES="${2:-}"
APP="$HELPER_DIR/AGB AI.app"
ZIP="$HELPER_DIR/AGB-AI.zip"

echo "==> build + sign the .app"
( cd "$HELPER_DIR" && ./make-app.sh )

echo "==> zip the bundle (ditto preserves macOS metadata + signature)"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "    $(du -h "$ZIP" | cut -f1) → $ZIP"

echo "==> publish to the CRM downloads bucket (version $VERSION)"
# Load Supabase creds from the CRM's .env.local for the upload.
if [[ -f "$CRM_DIR/.env.local" ]]; then
    export NEXT_PUBLIC_SUPABASE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$CRM_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
    export SUPABASE_SERVICE_ROLE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$CRM_DIR/.env.local" | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
fi
( cd "$CRM_DIR" && npx tsx scripts/publish-helper.ts "$ZIP" "$VERSION" "$NOTES" )

rm -f "$ZIP"
echo "==> done. Cofounders can download it at /capture in the CRM."
