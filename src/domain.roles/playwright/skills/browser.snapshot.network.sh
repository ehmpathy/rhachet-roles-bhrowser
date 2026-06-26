#!/usr/bin/env bash
######################################################################
# .what = capture network requests from browser tab
#
# .why  = HAR data for API debug and replay
#
# .pit-of-success:
#   requires both --tab AND --url to prevent wrong-tab mistakes.
#   if unsure which tab, run browser.describe first.
#
# .note = only captures NEW requests after listener attaches.
#         for prior pages, historical requests are not available.
#         trigger a page action to capture fresh requests.
#
# usage:
#   rhx browser.snapshot network --tab -1 --url 'account.squarespace.com/domains'
#   rhx browser.snapshot network --tab -1 --url 'account.squarespace.com/domains' --output .temp/debug
#
# output:
#   $OUTPUT_PREFIX/snapshot.network.json
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.snapshot network" \
    "capture network requests from browser tab" \
    "browser.snapshot network --focused | --tab N --url 'pattern'" \
    "--help: show this message" \
    "--focused: snapshot the focused tab" \
    "--tab N: tab index (0-based, negative from end)" \
    "--url 'pattern': verify tab URL contains pattern" \
    "--session NAME: browser session name (default: default)" \
    "--output PATH: output directory prefix"
fi

browser_get_snapshot_args "$@"
OUTPUT_FILE="$OUTPUT_PREFIX/snapshot.network.json"

# determine skill directory path
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# build CLI args for module invocation
STANDALONE_FLAG=""
if [[ "$STANDALONE_MODE" == "true" ]]; then
  STANDALONE_FLAG="--standalone"
fi

# invoke co-located TypeScript module
npx tsx "$SKILL_DIR/browser.snapshot.network.ts" \
  --wsEndpoint "$BROWSER_WS_ENDPOINT" \
  --tabIndex "$TAB_INDEX" \
  --outputFile "$OUTPUT_FILE" \
  $STANDALONE_FLAG
