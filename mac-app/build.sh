#!/bin/bash
# Builds "Nano Cortex Editor.app" (Apple Silicon) from ../index.html.
#
#   ./build.sh            app for yourself (includes ../img pedal pictures if present)
#   ./build.sh --public   app for a GitHub release (no pedal pictures) + zip in ../release
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC=false
[[ "${1:-}" == "--public" ]] && PUBLIC=true

APP_NAME="Nano Cortex Editor"
VERSION="$(node -p "require('./package.json').version")"
OUT="dist/${APP_NAME}-darwin-arm64/${APP_NAME}.app"

[[ -d node_modules ]] || npm install

# Bundle the editor (and, for personal builds, the optional pedal pictures).
rm -rf app
mkdir -p app
cp ../index.html app/index.html
if [[ "$PUBLIC" == false && -d ../img ]]; then
  cp -R ../img app/img
fi

npx @electron/packager . "$APP_NAME" \
  --platform=darwin \
  --arch=arm64 \
  --out=dist \
  --overwrite \
  --icon=assets/icon.icns \
  --app-bundle-id=local.nanocortex.editor \
  --app-version="$VERSION" \
  --extend-info=assets/extend-info.plist \
  --ignore='^/dist' \
  --ignore='^/assets' \
  --ignore='^/build\.sh$'

# Ad-hoc signature so macOS accepts the modified bundle and asks for Bluetooth access.
codesign --force --deep --sign - "$OUT"
echo "Built: $(pwd)/$OUT"

if [[ "$PUBLIC" == true ]]; then
  mkdir -p ../release
  ZIP="../release/Nano-Cortex-Editor-${VERSION}-mac-arm64.zip"
  rm -f "$ZIP"
  ditto -c -k --keepParent "$OUT" "$ZIP"
  echo "Release zip: $(cd ../release && pwd)/$(basename "$ZIP")"
fi
