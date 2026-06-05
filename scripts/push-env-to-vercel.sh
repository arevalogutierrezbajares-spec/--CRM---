#!/usr/bin/env bash
# Safely push a single secret from .env.local into Vercel (all 3 envs) WITHOUT
# ever printing its value. Usage:  bash scripts/push-env-to-vercel.sh GROQ_API_KEY
set -euo pipefail

VAR="${1:?usage: push-env-to-vercel.sh <VAR_NAME>}"
ENVFILE=".env.local"

[ -f "$ENVFILE" ] || { echo "✗ $ENVFILE not found"; exit 1; }

# Extract value: everything after the first '=', strip surrounding single/double quotes + whitespace.
VALUE="$(grep -m1 "^${VAR}=" "$ENVFILE" | cut -d= -f2- | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"

if [ -z "${VALUE}" ]; then
  echo "✗ ${VAR} is empty in ${ENVFILE} — paste the key after the '=' first, then re-run."
  exit 1
fi

# Masked confirmation only (never the full value).
MASK="${VALUE:0:4}…${VALUE: -4}"
echo "→ Uploading ${VAR} (${MASK}, ${#VALUE} chars) to Vercel: production, preview, development"

for ENVN in production preview development; do
  # Replace if it already exists (avoids the interactive overwrite prompt).
  vercel env rm "${VAR}" "${ENVN}" -y >/dev/null 2>&1 || true
  printf '%s' "${VALUE}" | vercel env add "${VAR}" "${ENVN}" >/dev/null 2>&1
  echo "   ✓ ${ENVN}"
done

echo "✓ Done. Verify with:  vercel env ls | grep ${VAR}"
