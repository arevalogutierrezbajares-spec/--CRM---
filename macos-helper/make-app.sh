#!/bin/bash
# make-app.sh — wrap the SwiftPM-built binary into "AGB AI.app" and
# (optionally) register it as a login item (FR-CALL-OPS-1).
#
#   ./make-app.sh                  build release binary + create ./AGB AI.app
#   ./make-app.sh --install-login  also register the app as a login item (SMAppService)
#   ./make-app.sh --uninstall-login  unregister the login item
#
# The .app bundle matters beyond login items: macOS TCC attributes Microphone
# and Screen Recording permission to the bundle identity, and the bundle's
# Info.plist carries the required NSMicrophoneUsageDescription. Run the helper
# from the bundle, not as a bare binary, for real capture.
#
# Product name (Finder/Dock): AGB AI
# Executable / SPM product:   AGBCaptureHelper (stable binary name)
# Bundle id / signing:        unchanged so TCC grants persist across rebuilds

set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="AGBCaptureHelper"
DISPLAY_NAME="AGB AI"
BUNDLE_ID="com.agb.capture-helper"
# Keep in sync with Sources/CaptureCore/AudioConstants.swift helperVersion.
VERSION="1.2.0"
APP_DIR="$PWD/$DISPLAY_NAME.app"
# Remove legacy bundle name so we don't leave two helpers around.
LEGACY_APP_DIR="$PWD/AGBCaptureHelper.app"

echo "==> swift build -c release"
swift build -c release

BIN="$(swift build -c release --show-bin-path)/$APP_NAME"
if [[ ! -x "$BIN" ]]; then
    echo "error: built binary not found at $BIN" >&2
    exit 1
fi

echo "==> assembling $APP_DIR"
rm -rf "$APP_DIR"
if [[ -d "$LEGACY_APP_DIR" ]]; then
    echo "    removing legacy $LEGACY_APP_DIR"
    rm -rf "$LEGACY_APP_DIR"
fi
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$BIN" "$APP_DIR/Contents/MacOS/$APP_NAME"

# Finder/Dock app icon (the AGB monogram). Regenerate with scripts/make-icon.sh
# when the logo changes; committed AppIcon.icns is bundled on every build.
if [[ -f "$PWD/AppIcon.icns" ]]; then
    cp "$PWD/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
else
    echo "    (no AppIcon.icns — run scripts/make-icon.sh; bundling without an icon)"
fi

# Idle cinema videos (Venezuela landscapes for the Bolívar intro).
INTRO_SRC="$PWD/Sources/AGBCaptureHelper/Resources/intro"
if [[ -d "$INTRO_SRC" ]]; then
    echo "    bundling intro videos → Contents/Resources/intro"
    mkdir -p "$APP_DIR/Contents/Resources/intro"
    cp -f "$INTRO_SRC"/*.mp4 "$APP_DIR/Contents/Resources/intro/" 2>/dev/null || true
fi

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>      <string>en</string>
    <key>CFBundleExecutable</key>             <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>             <string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key>  <string>6.0</string>
    <key>CFBundleName</key>                   <string>$DISPLAY_NAME</string>
    <key>CFBundleDisplayName</key>            <string>$DISPLAY_NAME</string>
    <key>CFBundleIconFile</key>               <string>AppIcon</string>
    <key>CFBundleIconName</key>               <string>AppIcon</string>
    <key>CFBundlePackageType</key>            <string>APPL</string>
    <key>CFBundleShortVersionString</key>     <string>$VERSION</string>
    <key>CFBundleVersion</key>                <string>$VERSION</string>
    <key>LSMinimumSystemVersion</key>         <string>14.0</string>
    <key>LSUIElement</key>                    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>AGB AI records your side of calls (with your explicit per-call consent) to file them into your CRM.</string>
    <key>NSAudioCaptureUsageDescription</key>
    <string>AGB AI records the other participants' audio — including FaceTime and other call apps — via a Core Audio process tap, so it can file the full conversation into your CRM (with your explicit per-call consent).</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>AGB AI transcribes your calls on-device with Apple Speech so the live transcript stays private to your Mac.</string>
    <key>NSHumanReadableCopyright</key>       <string>AGB AI — AGB CRM internal tool</string>
</dict>
</plist>
PLIST

# Stable code signing: a self-signed cert (in a dedicated keychain) gives a
# CERTIFICATE-based designated requirement, so macOS TCC keeps the Microphone /
# Screen Recording grants across rebuilds (ad-hoc signing is hash-based and
# resets the grant on every build). Set it up once with scripts/setup-signing.sh.
# Falls back to ad-hoc if the identity isn't present on this machine.
SIGN_IDENTITY="AGB Capture Helper"
SIGN_KEYCHAIN="$HOME/Library/Keychains/agb-signing.keychain-db"
SIGN_PASS_FILE="$HOME/.config/agb-capture-helper/signing-keychain.pass"
if [[ -f "$SIGN_KEYCHAIN" && -f "$SIGN_PASS_FILE" ]] \
   && security find-identity -v -p codesigning 2>/dev/null | grep -q "$SIGN_IDENTITY"; then
    echo "==> codesign with stable identity '$SIGN_IDENTITY' (TCC-persistent across rebuilds)"
    security unlock-keychain -p "$(cat "$SIGN_PASS_FILE")" "$SIGN_KEYCHAIN" 2>/dev/null || true
    codesign --force --keychain "$SIGN_KEYCHAIN" --sign "$SIGN_IDENTITY" "$APP_DIR"
else
    echo "==> codesign (ad-hoc fallback; run scripts/setup-signing.sh for a TCC-persistent identity)"
    codesign --force --sign - "$APP_DIR"
fi

echo "==> done: $APP_DIR"

if [[ "${1:-}" == "--install-login" ]]; then
    echo "==> registering login item via SMAppService"
    "$APP_DIR/Contents/MacOS/$APP_NAME" --install-login
    echo "    (manage under System Settings → General → Login Items)"
elif [[ "${1:-}" == "--uninstall-login" ]]; then
    echo "==> unregistering login item"
    "$APP_DIR/Contents/MacOS/$APP_NAME" --uninstall-login
fi

echo
echo "Launch:   open \"$APP_DIR\""
echo "Simulate: \"$APP_DIR/Contents/MacOS/$APP_NAME\" --simulate path/to/stereo16k.wav"
