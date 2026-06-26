#!/usr/bin/env bash
######################################################################
# .what = capture screenshot of browser tab
#
# .why  = visual record of page state
#
# .pit-of-success:
#   requires both --tab AND --url to prevent wrong-tab mistakes.
#   if unsure which tab, run browser.describe first.
#
# usage:
#   rhx browser.snapshot screen --tab -1 --url 'account.squarespace.com/domains'
#   rhx browser.snapshot screen --tab -1 --url 'account.squarespace.com/domains' --await domcontentloaded
#   rhx browser.snapshot screen --tab -1 --url 'account.squarespace.com/domains' --output .temp/debug
#
# flags:
#   --await <state>   wait for page state before capture (default: none)
#                     values: domcontentloaded, load, networkidle
#
# output:
#   $OUTPUT_PREFIX/snapshot.png
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.snapshot screen" \
    "capture screenshot of browser tab" \
    "browser.snapshot screen --focused | --tab N --url 'pattern' [--await STATE]" \
    "--help: show this message" \
    "--focused: snapshot the focused tab" \
    "--tab N: tab index (0-based, negative from end)" \
    "--url 'pattern': verify tab URL contains pattern" \
    "--await STATE: wait for page state (domcontentloaded, load, networkidle)" \
    "--session NAME: browser session name (default: default)" \
    "--output PATH: output directory prefix"
fi

browser_get_snapshot_args "$@"
OUTPUT_FILE="$OUTPUT_PREFIX/snapshot.png"

# determine skill directory path
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# build CLI args for module invocation
STANDALONE_FLAG=""
if [[ "$STANDALONE_MODE" == "true" ]]; then
  STANDALONE_FLAG="--standalone"
fi

AWAIT_FLAG=""
if [[ -n "$AWAIT_STATE" ]]; then
  AWAIT_FLAG="--awaitState $AWAIT_STATE"
fi

# invoke co-located TypeScript module
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 npx tsx "$SKILL_DIR/browser.snapshot.screen.ts" \
  --wsEndpoint "$BROWSER_WS_ENDPOINT" \
  --tabIndex "$TAB_INDEX" \
  --outputFile "$OUTPUT_FILE" \
  $AWAIT_FLAG \
  $STANDALONE_FLAG
