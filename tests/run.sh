#!/bin/bash
# Runs the editor's tests without a Nano: index.html with a mock state (mock.js), a fake controller (fake-board.js)
# and one test script each, in headless Chrome. A test writes "PASS ..." / "FAIL ..." lines into the page title.
#   tests/run.sh            all tests, then the dialog check at three window sizes
# Needs Google Chrome (set CHROME=<path> for another Chromium).
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
page() {   # page <name> <script> ... : index.html with the scripts before </body>
  local name="$1"; shift
  python3 - "$OUT/$name.html" "$@" <<'PY'
import sys, pathlib
out, files = sys.argv[1], sys.argv[2:]
page = pathlib.Path('index.html').read_text()
pathlib.Path(out).write_text(page.replace('</body>', ''.join(pathlib.Path('tests/' + f).read_text() for f in files) + '</body>', 1))
PY
}
title() {   # title <name> <window> [#hash]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size="$2" --virtual-time-budget=25000 --dump-dom "file://$OUT/$1.html${3:-}" 2>/dev/null |
    python3 -c 'import re, sys, html; m = re.search(r"<head>.*?<title>(.*?)</title>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m else "no title")'
}
failed=0
run() {   # run <name> <scripts ...>
  local name="$1"; shift
  page "$name" "$@"
  local result; result="$(title "$name" 1440,900)"
  local pass fail
  pass=$({ grep -o 'PASS ' <<<"$result" || true; } | wc -l | tr -d ' ')
  fail=$({ grep -o 'FAIL \|ERROR ' <<<"$result" || true; } | wc -l | tr -d ' ')
  printf '%-24s %2s passed, %s failed\n' "$name" "$pass" "$fail"
  if [[ "$fail" != 0 || "$pass" == 0 ]]; then failed=1; tr '|' '\n' <<<"$result" | { grep -v '^ *PASS' || true; } | sed 's/^/    /'; fi
}
run gain-reduction   mock.js test-gain-reduction.js
run metronome        mock.js test-metronome.js
run listen-capture   mock.js library.js test-listen-capture.js
run listen-ir        mock.js library.js test-listen-ir.js
run board-strip      mock.js fake-board.js test-board-strip.js
page dialogs mock.js library.js check-dialogs.js
for size in 1440,900 1000,517 760,447; do
  result="$(title dialogs "$size")"
  echo "dialogs at $result" | tr '|' '\n' | sed '2,$s/^/    /'
  grep -q 'all dialogs fit' <<<"$result" || failed=1
done
result="$(title dialogs 402,874 '#outer')"
echo "dialogs (Duo closed) at $result" | tr '|' '\n' | sed '2,$s/^/    /'
grep -q 'all dialogs fit' <<<"$result" || failed=1
exit $failed
