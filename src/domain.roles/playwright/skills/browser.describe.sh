#!/usr/bin/env bash
######################################################################
# .what = describe tabs open in the persistent browser
#
# .why  = enables agent to see what tabs exist before snapshot:
#         - know which --tab index to use
#         - verify test navigated to correct page
#         - debug tab state
#
# usage:
#   rhx browser.describe
#   rhx browser.describe --session test1   # specific session
#
# output:
#   lists all tabs with index and url
#
# prereq:
#   browser must be started via browser.start skill
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.describe" \
    "list open tabs in the browser" \
    "browser.describe [--session NAME]" \
    "--help: show this message" \
    "--session NAME: browser session name (default: default)"
fi

# parse args via named function
browser_get_describe_args "$@"

browser_init_session "$SESSION"
browser_require_endpoint

# describe tabs via co-located typescript module
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.describe.ts" \
  --wsEndpoint "$BROWSER_WS_ENDPOINT" \
  --session "$SESSION"
