#!/usr/bin/env bash
# setup-signing.sh — create a STABLE self-signed code-signing identity for the
# Helper, so macOS TCC keeps the Microphone / Screen Recording grants across
# rebuilds.
#
# WHY: ad-hoc signing (`codesign -s -`) ties the TCC designated requirement to
# the binary hash, which changes every build — so every rebuild wipes the
# Screen Recording grant and you have to re-approve. A self-signed certificate
# gives a CERTIFICATE-based requirement (`certificate leaf = H"…"`) that is
# identical across rebuilds, so the grant persists. (A real Apple Developer ID
# would also work; this needs no Apple account.)
#
# Run once:  bash macos-helper/scripts/setup-signing.sh
# Then:      ./make-app.sh   (auto-signs with the identity)
# Idempotent: re-running reuses the existing identity.
#
# Stores the dedicated keychain's password at
#   ~/.config/agb-capture-helper/signing-keychain.pass  (0600, never in the repo)
set -euo pipefail

KCNAME="agb-signing.keychain"
KCPATH="$HOME/Library/Keychains/${KCNAME}-db"
IDENTITY="AGB Capture Helper"
PASS_DIR="$HOME/.config/agb-capture-helper"
PASS_FILE="$PASS_DIR/signing-keychain.pass"

if [[ -f "$KCPATH" && -f "$PASS_FILE" ]] \
   && security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTITY"; then
    echo "✓ signing identity '$IDENTITY' already set up — nothing to do."
    exit 0
fi

mkdir -p "$PASS_DIR"
KCPASS="$(openssl rand -hex 16)"
printf '%s' "$KCPASS" > "$PASS_FILE"
chmod 600 "$PASS_FILE"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT; cd "$WORK"

# Self-signed cert with the codeSigning EKU.
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 3650 -nodes \
  -subj "/CN=$IDENTITY" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning"
# -legacy: Apple's `security import` can't read openssl-3 default PKCS12 MACs.
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -out id.p12 \
  -passout "pass:$KCPASS" -name "$IDENTITY"

# Dedicated keychain (its own password — never touches the login keychain).
security delete-keychain "$KCNAME" 2>/dev/null || true
security create-keychain -p "$KCPASS" "$KCNAME"
security set-keychain-settings "$KCNAME"            # no auto-lock timeout
security unlock-keychain -p "$KCPASS" "$KCNAME"
security import id.p12 -k "$KCNAME" -P "$KCPASS" -A -T /usr/bin/codesign
security add-trusted-cert -r trustRoot -p codeSign -k "$KCNAME" cert.pem
# Let codesign use the private key without an interactive prompt.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KCPASS" "$KCNAME" >/dev/null
# Add to the user keychain search list so codesign finds the identity.
EXISTING=$(security list-keychains -d user | sed 's/[" ]//g' | grep -v "$KCNAME" | tr '\n' ' ')
security list-keychains -d user -s "$KCNAME" $EXISTING

if security find-identity -v -p codesigning | grep -q "$IDENTITY"; then
    echo "✓ created stable signing identity '$IDENTITY'."
    echo "  Rebuilds (./make-app.sh) now keep the Screen Recording grant."
else
    echo "✗ identity not found after setup — make-app.sh will fall back to ad-hoc." >&2
    exit 1
fi
