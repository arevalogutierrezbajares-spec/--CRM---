#!/usr/bin/env bash
# make-icon.sh — (re)generate AppIcon.icns for the Capture Helper from the AGB
# monogram (public/logos/crm.svg, redrawn natively so we don't depend on an SVG
# rasterizer). Run this only when the logo changes; make-app.sh bundles the
# committed AppIcon.icns on every build.
#
#   bash macos-helper/scripts/make-icon.sh
set -euo pipefail
HELPER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PNG="/tmp/agb-icon-1024.png"
ICONSET="/tmp/AGBCaptureHelper.iconset"

echo "==> render 1024px master"
swift "$HELPER_DIR/scripts/render-icon.swift"

echo "==> build iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
sips -z 16 16   "$PNG" --out "$ICONSET/icon_16x16.png"      >/dev/null
sips -z 32 32   "$PNG" --out "$ICONSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32   "$PNG" --out "$ICONSET/icon_32x32.png"      >/dev/null
sips -z 64 64   "$PNG" --out "$ICONSET/icon_32x32@2x.png"   >/dev/null
sips -z 128 128 "$PNG" --out "$ICONSET/icon_128x128.png"    >/dev/null
sips -z 256 256 "$PNG" --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$PNG" --out "$ICONSET/icon_256x256.png"    >/dev/null
sips -z 512 512 "$PNG" --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$PNG" --out "$ICONSET/icon_512x512.png"    >/dev/null
cp "$PNG" "$ICONSET/icon_512x512@2x.png"

echo "==> iconutil -> AppIcon.icns"
iconutil -c icns "$ICONSET" -o "$HELPER_DIR/AppIcon.icns"
echo "    $(ls -la "$HELPER_DIR/AppIcon.icns" | awk '{print $5}') bytes → $HELPER_DIR/AppIcon.icns"
