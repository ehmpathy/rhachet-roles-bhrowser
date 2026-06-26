#!/usr/bin/env bash
######################################################################
# .what = manage browser session state (cookies, localStorage)
#
# .why  = enables cross-session authentication via storageState:
#         - human solves captcha in headful browser
#         - save session state to file
#         - headless browser restores authenticated state
#
# usage:
#   rhx browser.session get --session foo
#   rhx browser.session set --session foo --from /path/to/state.json
#   rhx browser.session set --session foo --from @storage
#   rhx browser.session del --session foo
#
# subcommands:
#   get         inspect session state (cookies count, localStorage keys)
#   set         import session state from file or active browser
#   del         clear session state
#
# options:
#   --session   session name (required)
#   --from      source for set: file path or @storage (from active browser)
#
# guarantee:
#   - state stored in .cache/browser.$session/storageState.json
#   - compatible with playwright's storageState format
#   - fail-fast on errors
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.session" \
    "manage browser session state (cookies, localStorage)" \
    "browser.session <get|set|del> --session NAME [--from PATH]" \
    "--help: show this message" \
    "get: inspect session state" \
    "set: import session state from file or active browser" \
    "del: clear session state" \
    "--session NAME: session name (required)" \
    "--from PATH: source for set (file path or @storage)"
fi

# parse all args via named function (handles rhachet passthrough args)
browser_get_session_main_args "$@"

# require subcommand
if [[ -z "$SUBCOMMAND" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: subcommand required" >&2
  echo "   context: {\"valid\":[\"get\",\"set\",\"del\"]}" >&2
  echo "   │" >&2
  echo "   └─ usage" >&2
  echo "      ├─ rhx browser.session get --session foo" >&2
  echo "      ├─ rhx browser.session set --session foo --from /path/to/state.json" >&2
  echo "      ├─ rhx browser.session set --session foo --from @storage" >&2
  echo "      └─ rhx browser.session del --session foo" >&2
  exit 2
fi

# require --session
if [[ -z "$SESSION" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --session required" >&2
  echo "   context: {\"subcommand\":\"$SUBCOMMAND\"}" >&2
  echo "   hint: specify session name, e.g., --session default" >&2
  exit 2
fi

browser_init_session "$SESSION"
STORAGE_STATE_FILE="$SESSION_DIR/storageState.json"
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

#######################################
# named orchestrator: handle session get
#######################################
handle_session_get() {
  if [[ ! -f "$STORAGE_STATE_FILE" ]]; then
    echo "🦎 cold snap"
    echo ""
    echo "📽️ browser.session get"
    echo "   ├─ session: $SESSION"
    echo "   ├─ state: none"
    echo "   │"
    echo "   └─ hint"
    echo "      ├─ no session state found for '$SESSION'"
    echo "      └─ to save: rhx browser.session set --session $SESSION --from @storage"
    exit 0
  fi

  # parse storageState and format output via co-located typescript module
  NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.session.ts" \
    --subcommand get \
    --session "$SESSION" \
    --storageStateFile "$STORAGE_STATE_FILE"
  exit 0
}

#######################################
# named orchestrator: handle session set
#######################################
handle_session_set() {
  if [[ -z "$FROM_SOURCE" ]]; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: --from required for set" >&2
    echo "   hint: specify source file or @storage" >&2
    echo "   │" >&2
    echo "   └─ usage" >&2
    echo "      ├─ rhx browser.session set --session $SESSION --from /path/to/state.json" >&2
    echo "      └─ rhx browser.session set --session $SESSION --from @storage" >&2
    exit 2
  fi

  mkdir -p "$SESSION_DIR"

  # from @storage: extract from active browser
  if [[ "$FROM_SOURCE" == "@storage" ]]; then
    browser_require_endpoint

    NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.session.ts" \
      --subcommand set-from-storage \
      --session "$SESSION" \
      --storageStateFile "$STORAGE_STATE_FILE" \
      --wsEndpoint "$BROWSER_WS_ENDPOINT"
    exit 0
  fi

  # from file path: validate and copy
  if [[ ! -f "$FROM_SOURCE" ]]; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: source file not found" >&2
    echo "   context: {\"path\":\"$FROM_SOURCE\"}" >&2
    echo "   hint: verify the file exists at the specified path" >&2
    exit 2
  fi

  # validate JSON structure via co-located typescript module
  if ! NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.session.ts" \
    --subcommand validate-storage-state \
    --session "$SESSION" \
    --storageStateFile "$STORAGE_STATE_FILE" \
    --fromSource "$FROM_SOURCE" 2>&1; then
    exit 2
  fi

  # copy to session dir
  cp "$FROM_SOURCE" "$STORAGE_STATE_FILE"

  # count contents via co-located typescript module
  NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.session.ts" \
    --subcommand set-from-file \
    --session "$SESSION" \
    --storageStateFile "$STORAGE_STATE_FILE" \
    --fromSource "$FROM_SOURCE"
  exit 0
}

#######################################
# named orchestrator: handle session del
#######################################
handle_session_del() {
  if [[ ! -f "$STORAGE_STATE_FILE" ]]; then
    echo "🦎 basked"
    echo ""
    echo "📽️ browser.session del"
    echo "   ├─ session: $SESSION"
    echo "   └─ state: already clear"
    exit 0
  fi

  rm -f "$STORAGE_STATE_FILE"

  echo "🦎 suns down"
  echo ""
  echo "📽️ browser.session del"
  echo "   ├─ session: $SESSION"
  echo "   └─ state: cleared"
  exit 0
}

# dispatch to named handler
case "$SUBCOMMAND" in
  get) handle_session_get ;;
  set) handle_session_set ;;
  del) handle_session_del ;;
esac
