#!/bin/bash
# Builds "Nano Cortex Editor.app" (Apple Silicon) from ../index.html.
#
#   ./build.sh            app for yourself (includes ../img pedal pictures if present)
#   ./build.sh --public   app for a GitHub release (no pedal pictures) + zip in ../release
#   ./build.sh --beta     "Nano Cortex Editor Beta": the same editor plus what beta/ tries out (its version and
#                         name in beta/beta.json) - an app of its own, with its own settings, next to the normal
#                         one. With --public as well: without pedal pictures, and a zip in ../release
#
# NANO_DIST=dist/next ./build.sh builds into another folder (under dist), next to an app that is running from dist.
set -euo pipefail
cd "$(dirname "$0")"

PUBLIC=false
BETA=false
for option in "$@"; do
  [[ "$option" == "--public" ]] && PUBLIC=true
  [[ "$option" == "--beta" ]] && BETA=true
done

APP_NAME="Nano Cortex Editor"
BUNDLE_ID="local.nanocortex.editor"
INFO="assets/extend-info.plist"
VERSION="$(node -p "require('./package.json').version")"
APP_VERSION="$VERSION"
if [[ "$BETA" == true ]]; then
  APP_NAME="Nano Cortex Editor Beta"
  BUNDLE_ID="local.nanocortex.editor.beta"
  INFO="beta/extend-info.plist"
  APP_VERSION="$(node -p "require('./beta/beta.json').version")"
fi
DIST="${NANO_DIST:-dist}"
OUT="$DIST/${APP_NAME}-darwin-arm64/${APP_NAME}.app"

# The editor shows its own version (EDITOR_VERSION in index.html); app and editor must agree.
EDITOR_VERSION="$(sed -n "s/.*const EDITOR_VERSION = '\([^']*\)'.*/\1/p" ../index.html)"
if [[ "$EDITOR_VERSION" != "$VERSION" ]]; then
  echo "Version mismatch: index.html has '$EDITOR_VERSION', package.json has '$VERSION'" >&2
  exit 1
fi

[[ -d node_modules ]] || npm install

# Level meter helper: reads the Nano's USB audio (channels 3/4), which the page itself cannot. Needs the Swift
# compiler of Xcode or its command line tools. Built for macOS 13 and later, like the Electron app itself.
swiftc -O -target arm64-apple-macos13.0 -o native/nano-meter native/nano-meter.swift
# (beta) Monitor helper: plays the Nano's USB audio through another audio device.
[[ "$BETA" == true ]] && swiftc -O -target arm64-apple-macos13.0 -o native/nano-monitor native/nano-monitor.swift

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

# (beta) Its part of the page goes at the end of the editor, and app/beta.json tells the app that it is the beta.
if [[ "$BETA" == true ]]; then
  node -e '
    const fs = require("fs");
    const html = fs.readFileSync("app/index.html", "utf8");
    const page = fs.readFileSync("beta/monitor-page.js", "utf8");
    const at = html.lastIndexOf("</body>");
    if (at < 0 || page.includes("</script")) throw new Error("beta page part not added");
    fs.writeFileSync("app/index.html", html.slice(0, at) + "<script>\n" + page + "</script>\n" + html.slice(at));
  '
  cp beta/beta.json app/beta.json
  echo "Beta $APP_VERSION: $(node -p "require('./beta/beta.json').feature")"
fi

npx @electron/packager . "$APP_NAME" \
  --platform=darwin \
  --arch=arm64 \
  --out="$DIST" \
  --overwrite \
  --icon=assets/icon.icns \
  --app-bundle-id="$BUNDLE_ID" \
  --app-version="$APP_VERSION" \
  --extend-info="$INFO" \
  --ignore='^/dist' \
  --ignore='^/assets' \
  --ignore='^/native' \
  --ignore='^/beta' \
  --ignore='^/build\.sh$'

# The helper sits next to the app's executable, so the signature below covers it.
cp native/nano-meter "$OUT/Contents/MacOS/nano-meter"
[[ "$BETA" == true ]] && cp native/nano-monitor "$OUT/Contents/MacOS/nano-monitor"

# Ad-hoc signature so macOS accepts the modified bundle and asks for Bluetooth access.
codesign --force --deep --sign - "$OUT"
echo "Built: $(pwd)/$OUT"

if [[ "$PUBLIC" == true ]]; then
  mkdir -p ../release
  ZIP="../release/Nano-Cortex-Editor-${VERSION}-mac-arm64.zip"
  [[ "$BETA" == true ]] && ZIP="../release/Nano-Cortex-Editor-Beta-${APP_VERSION}-mac-arm64.zip"
  rm -f "$ZIP"
  ditto -c -k --keepParent "$OUT" "$ZIP"
  echo "Release zip: $(cd ../release && pwd)/$(basename "$ZIP")"
fi
