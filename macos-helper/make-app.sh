#!/bin/bash
# make-app.sh — wrap the SwiftPM-built binary into AGBCaptureHelper.app and
# (optionally) register it as a login item (FR-CALL-OPS-1).
#
#   ./make-app.sh                  build release binary + create ./AGBCaptureHelper.app
#   ./make-app.sh --install-login  also register the app as a login item (SMAppService)
#   ./make-app.sh --uninstall-login  unregister the login item
#
# The .app bundle matters beyond login items: macOS TCC attributes Microphone
# and Screen Recording permission to the bundle identity, and the bundle's
# Info.plist carries the required NSMicrophoneUsageDescription. Run the helper
# from the bundle, not as a bare binary, for real capture.

set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="AGBCaptureHelper"
BUNDLE_ID="com.agb.capture-helper"
VERSION="1.0.0"
APP_DIR="$PWD/$APP_NAME.app"

echo "==> swift build -c release"
swift build -c release

BIN="$(swift build -c release --show-bin-path)/$APP_NAME"
if [[ ! -x "$BIN" ]]; then
    echo "error: built binary not found at $BIN" >&2
    exit 1
fi

echo "==> assembling $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$BIN" "$APP_DIR/Contents/MacOS/$APP_NAME"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>      <string>en</string>
    <key>CFBundleExecutable</key>             <string>$APP_NAME</string>
    <key>CFBundleIdentifier</key>             <string>$BUNDLE_ID</string>
    <key>CFBundleInfoDictionaryVersion</key>  <string>6.0</string>
    <key>CFBundleName</key>                   <string>AGB Capture Helper</string>
    <key>CFBundlePackageType</key>            <string>APPL</string>
    <key>CFBundleShortVersionString</key>     <string>$VERSION</string>
    <key>CFBundleVersion</key>                <string>$VERSION</string>
    <key>LSMinimumSystemVersion</key>         <string>14.0</string>
    <key>LSUIElement</key>                    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>AGB Capture Helper records your side of calls (with your explicit per-call consent) to file them into your CRM.</string>
    <key>NSHumanReadableCopyright</key>       <string>AGB CRM internal tool</string>
</dict>
</plist>
PLIST

echo "==> codesign (ad-hoc; OD-3: local build for the single founder machine)"
codesign --force --sign - "$APP_DIR"

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
