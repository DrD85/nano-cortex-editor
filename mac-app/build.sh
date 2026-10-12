#!/bin/bash
# Builds "Nano Cortex Editor.app" (Apple Silicon) from ../index.html.
#
#   ./build.sh            app for yourself (includes ../img pedal pictures if present)
#   ./build.sh --public   app for a GitHub release (no pedal pictures) + zip in ../release
#
# NANO_DIST=dist/next ./build.sh builds into another folder (under dist), next to an app that is running from dist.
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC=false
[[ "${1:-}" == "--public" ]] && PUBLIC=true

APP_NAME="Nano Cortex Editor"
VERSION="$(node -p "require('./package.json').version")"
DIST="${NANO_DIST:-dist}"
OUT="$DIST/${APP_NAME}-darwin-arm64/${APP_NAME}.app"

# The editor shows its own version (EDITOR_VERSION in index.html); app and editor must agree.
EDITOR_VERSION="$(sed -n "s/.*const EDITOR_VERSION = '\([^']*\)'.*/\1/p" ../index.html)"
if [[ "$EDITOR_VERSION" != "$VERSION" ]]; then
  echo "Version mismatch: index.html has '$EDITOR_VERSION', package.json has '$VERSION'" >&2
  exit 1
fi

[[ -d node_modules ]] || npm install

# The helpers next to the app, for what the page itself cannot do with the Nano's USB audio (its sound is on
# channels 3/4): the level meter, the monitor (plays it through another audio device) and the spectrum of the EQ
# view. They need the Swift compiler of Xcode or its command line tools, and are built for macOS 13 and later, like
# the Electron app itself.
for helper in nano-meter nano-monitor nano-spectrum; do
  swiftc -O -target arm64-apple-macos13.0 -o "native/$helper" "native/$helper.swift"
done

# Bundle the editor (and, for personal builds, the optional pedal pictures).
rm -rf app
mkdir -p app
cp ../index.html app/index.html
# Licence of the embedded IBM Plex Sans font (SIL OFL 1.1) goes with the app
mkdir -p app/fonts
cp ../fonts/OFL-IBM-Plex-Sans.txt app/fonts/
if [[ "$PUBLIC" == false && -d ../img ]]; then
  cp -R ../img app/img
  # Optional personal icon set: ../img/icons.css overrides the drawn --ico-* icons.
  if [[ -f ../img/icons.css ]]; then
    node -e '
      const fs = require("fs");
      const html = fs.readFileSync("app/index.html", "utf8");
      const css = fs.readFileSync("../img/icons.css", "utf8");
      fs.writeFileSync("app/index.html", html.replace("</head>", "<style>\n" + css + "</style>\n</head>"));
    '
    rm app/img/icons.css
    echo "Using personal icons from ../img/icons.css"
  fi
fi

npx @electron/packager . "$APP_NAME" \
  --platform=darwin \
  --arch=arm64 \
  --out="$DIST" \
  --overwrite \
  --icon=assets/icon.icns \
  --app-bundle-id=local.nanocortex.editor \
  --app-version="$VERSION" \
  --extend-info=assets/extend-info.plist \
  --ignore='^/dist' \
  --ignore='^/assets' \
  --ignore='^/native' \
  --ignore='^/build\.sh$'

# The helpers sit next to the app's executable, so the signature below covers them.
cp native/nano-meter native/nano-monitor native/nano-spectrum "$OUT/Contents/MacOS/"

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
