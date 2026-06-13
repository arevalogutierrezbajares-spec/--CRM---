#!/usr/bin/env bash
# Wire the macOS Capture Helper to prod, end to end:
#   1. generate a token locally (plaintext NEVER leaves this machine)
#   2. write the Helper config (0600)
#   3. insert ONLY the SHA-256 hash into prod capture_tokens (the server design)
#   4. relaunch the Helper so it picks up the token
#   5. verify the connection via /api/capture/ping
#
# Run from the repo root:  bash scripts/wire-helper.sh
set -euo pipefail

WS="11111111-2222-3333-4444-aaaaaaaaaaa1"          # primary workspace (9 members, your recordings)
USERID="a408e392-1337-4cb3-acc5-f8c1881f1522"      # its owner
CRM="https://x.caneycloud.com"
CFGDIR="$HOME/Library/Application Support/AGBCaptureHelper"
APP="/Users/tomas/AGB-CRM/macos-helper/AGBCaptureHelper.app"

cd "$(dirname "$0")/.."

# 1. token + hash (local only)
TOKEN="agbcap_$(openssl rand -hex 32)"
HASH=$(printf '%s' "$TOKEN" | shasum -a 256 | awk '{print $1}')

# 2. config (plaintext stays here)
mkdir -p "$CFGDIR"; chmod 700 "$CFGDIR"
printf '{\n  "crmBaseUrl": "%s",\n  "token": "%s",\n  "neverPromptApps": [],\n  "helperVersion": "1.0.0"\n}\n' \
  "$CRM" "$TOKEN" > "$CFGDIR/config.json"
chmod 600 "$CFGDIR/config.json"
echo "✓ config written (token ${TOKEN:0:12}… kept local, mode 0600)"

# 3. insert hash into prod
DBURL=$(grep -E "^DATABASE_URL=" .env.local | head -1 | cut -d= -f2- | tr -d '"')
PSQL_URL="${DBURL%%\?*}?sslmode=require"
psql "$PSQL_URL" -v ON_ERROR_STOP=1 -c \
  "insert into capture_tokens (workspace_id, user_id, name, token_hash) values ('$WS','$USERID','Mac Helper (auto-wired)','$HASH');"
echo "✓ token hash inserted into prod capture_tokens"

# 4. relaunch Helper
pkill -f "AGBCaptureHelper.app/Contents/MacOS/AGBCaptureHelper" 2>/dev/null || true
sleep 1
open "$APP"
sleep 2
echo "✓ Helper relaunched"

# 5. verify connection
CODE=$(curl -s -o /tmp/agb-ping.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$CRM/api/capture/ping")
if [ "$CODE" = "200" ]; then
  echo "✓ CONNECTION VERIFIED — Helper authenticated to prod:"
  cat /tmp/agb-ping.json; echo
  echo ""
  echo "Done. Make a real WhatsApp/Zoom call with your AirPods in →"
  echo "you'll get the 'Call detected. Record?' prompt → hang up →"
  echo "the call appears at $CRM/record with both voices transcribed."
else
  echo "✗ ping returned $CODE — check the token/URL and the Screen Recording permission."
  cat /tmp/agb-ping.json 2>/dev/null; echo
fi
rm -f /tmp/agb-ping.json