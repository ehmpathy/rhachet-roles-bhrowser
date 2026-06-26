#!/usr/bin/env bash
######################################################################
# .what = stop the persistent browser started via browser.start
#
# .why  = clean shutdown of browser and state file
#
# usage:
#   rhx browser.stop
#   rhx browser.stop --session test1   # specific session
#
# guarantee:
#   - kills browser process on CDP port
#   - removes state file
#   - idempotent (safe to run if browser already stopped)
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.stop" \
    "stop a persistent browser" \
    "browser.stop [--session NAME]" \
    "--help: show this message" \
    "--session NAME: browser session name (default: default)"
fi

# parse args via named function
browser_get_stop_args "$@"

browser_init_session "$SESSION"
CDP_PORT=$(browser_cdp_port)

# named transformer: check if browser is active on CDP port
is_browser_active() {
  fuser "$CDP_PORT/tcp" > /dev/null 2>&1
}

# named transformer: kill browser on CDP port if active
kill_browser_if_active() {
  if is_browser_active; then
    fuser -k "$CDP_PORT/tcp" > /dev/null 2>&1 || true
    return 0
  fi
  return 1
}

# named transformer: remove state file if present
remove_state_file_if_present() {
  if [[ -f "$WSENDPOINT_FILE" ]]; then
    rm -f "$WSENDPOINT_FILE"
    return 0
  fi
  return 1
}

# determine status before action
BROWSER_ACTIVE=""
if is_browser_active; then
  BROWSER_ACTIVE="true"
fi

# kill browser and clean up state
# .note = || true because return 1 means "no browser found", not failure
kill_browser_if_active || true
STATE_FILE_REMOVED=""
if remove_state_file_if_present; then
  STATE_FILE_REMOVED="true"
fi

# turtle shell header
echo "🦎 suns down"
echo ""
echo "📽️ browser.stop"
echo "   ├─ session: $SESSION"
echo "   ├─ port: $CDP_PORT"
echo "   │"
if [[ -n "$BROWSER_ACTIVE" ]]; then
  echo "   ├─ browser: stopped"
else
  echo "   ├─ browser: no browser found"
fi
if [[ -n "$STATE_FILE_REMOVED" ]]; then
  echo "   └─ state: removed"
else
  echo "   └─ state: no state file"
fi
