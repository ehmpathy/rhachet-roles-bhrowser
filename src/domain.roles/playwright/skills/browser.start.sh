#!/usr/bin/env bash
######################################################################
# .what = start a persistent browser for test reuse
#
# .why  = enables browser to stay open across test crashes so that:
#         - human can inspect browser state after failure
#         - agent can take screenshots via browser.snapshot.sh
#         - tests can reconnect without cold start
#
# usage:
#   rhx browser.start --mode HEADFUL
#   rhx browser.start --mode HEADLESS
#   rhx browser.start --mode HEADFUL --session test1   # named session
#   rhx browser.start --mode HEADFUL --refresh         # kills prior browser first
#
# output:
#   writes wsEndpoint to .cache/browser.$session/ws-endpoint for auto-discovery
#
# guarantee:
#   - browser stays open until killed
#   - tests auto-discover via state file
#   - requires explicit --mode
######################################################################

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.start" \
    "start a persistent browser for automation" \
    "browser.start --mode HEADFUL|HEADLESS [--session NAME] [--refresh]" \
    "--help: show this message" \
    "--mode: HEADFUL (visible) or HEADLESS (background) (required)" \
    "--session NAME: browser session name (default: default)" \
    "--refresh: kill extant browser before starting new one"
fi

# parse args via named function
browser_get_start_args "$@"

# require explicit mode
if [[ -z "$MODE" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --mode required" >&2
  echo "   context: {\"valid\":[\"HEADFUL\",\"HEADLESS\"]}" >&2
  echo "   │" >&2
  echo "   └─ usage" >&2
  echo "      ├─ rhx browser.start --mode HEADFUL" >&2
  echo "      └─ rhx browser.start --mode HEADLESS" >&2
  exit 2
fi

# named transformer: check if mode is valid
is_mode_valid() {
  [[ "$MODE" == "HEADFUL" || "$MODE" == "HEADLESS" ]]
}

if ! is_mode_valid; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: invalid mode" >&2
  echo "   context: {\"given\":\"$MODE\",\"valid\":[\"HEADFUL\",\"HEADLESS\"]}" >&2
  exit 2
fi

browser_init_session "$SESSION"
mkdir -p "$SESSION_DIR"

CDP_PORT_CHECK=$(browser_cdp_port)

# named transformer: check if browser is alive on CDP port
is_browser_alive_on_port() {
  local port="$1"
  curl -s "http://localhost:$port/json/version" > /dev/null 2>&1
}

# named transformer: check if state file has active browser
has_state_file_with_active_browser() {
  [[ -f "$WSENDPOINT_FILE" ]] && is_browser_alive_on_port "$CDP_PORT_CHECK"
}

# named transformer: check if state file exists but browser is stale
has_stale_state_file() {
  [[ -f "$WSENDPOINT_FILE" ]] && ! is_browser_alive_on_port "$CDP_PORT_CHECK"
}

# named orchestrator: check for active browser and fail if --refresh not specified
check_for_active_browser() {
  if [[ "$REFRESH" == "true" ]]; then
    return 0
  fi
  if has_state_file_with_active_browser; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: browser already active" >&2
    echo "   context: {\"session\":\"$SESSION\"}" >&2
    echo "   hint: use --refresh to kill and restart, or use a different --session" >&2
    exit 2
  fi
  if has_stale_state_file; then
    rm -f "$WSENDPOINT_FILE"
  fi
}

check_for_active_browser

# user data dir for persistent profile (retains session cookies)
USER_DATA_DIR="$SESSION_DIR/profile"
mkdir -p "$USER_DATA_DIR/Default"

CDP_PORT=$(browser_cdp_port)

# write preferences to disable password prompts (only if not present)
PREFS_FILE="$USER_DATA_DIR/Default/Preferences"
if [[ ! -f "$PREFS_FILE" ]]; then
  cat > "$PREFS_FILE" << 'PREFS_EOF'
{
  "credentials_enable_service": false,
  "profile": {
    "password_manager_enabled": false
  },
  "session": {
    "restore_on_startup": 4,
    "startup_urls": []
  }
}
PREFS_EOF
fi

# named transformer: extract port from ws://localhost:PORT/... endpoint URL
extract_port_from_ws_endpoint() {
  local endpoint="$1"
  echo "$endpoint" | sed 's|ws://localhost:\([0-9]*\)/.*|\1|'
}

# named transformer: extract webSocketDebuggerUrl from CDP version JSON
extract_ws_endpoint_from_cdp_json() {
  local cdp_port="$1"
  curl -s "http://localhost:$cdp_port/json/version" | grep -oP '"webSocketDebuggerUrl"\s*:\s*"\K[^"]+'
}

# named orchestrator: wait for CDP to become ready on port
wait_for_cdp_ready() {
  local cdp_port="$1"
  local max_attempts="${2:-30}"
  for i in $(seq 1 "$max_attempts"); do
    if curl -s "http://localhost:$cdp_port/json/version" > /dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

# named orchestrator: handle refresh by kill of prior browser
handle_refresh_kill_prior() {
  if [[ "$REFRESH" != "true" ]]; then
    return 0
  fi
  if [[ ! -f "$WSENDPOINT_FILE" ]]; then
    return 0
  fi
  local prior_endpoint prior_port
  prior_endpoint=$(cat "$WSENDPOINT_FILE")
  prior_port=$(extract_port_from_ws_endpoint "$prior_endpoint")
  if [[ -n "$prior_port" ]]; then
    fuser -k "$prior_port/tcp" > /dev/null 2>&1 || true
  fi
  rm -f "$WSENDPOINT_FILE"
}

handle_refresh_kill_prior

# named transformer: extract chromium version from playwright dry-run
get_chromium_version_from_playwright() {
  npx playwright install chromium --dry-run 2>/dev/null | grep -oP 'chromium-\d+' | head -1
}

# named transformer: find chromium binary in playwright cache
find_chromium_binary() {
  local version="$1"
  if [[ -n "$version" ]]; then
    find ~/.cache/ms-playwright -path "*$version*" -name "chrome" -type f 2>/dev/null | head -1
  else
    find ~/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1
  fi
}

# get playwright's bundled chromium path
# .note = --dry-run is playwright CLI flag, not changeable
CHROMIUM_VERSION=$(get_chromium_version_from_playwright)
CHROMIUM_BIN=$(find_chromium_binary "$CHROMIUM_VERSION")

if [[ -z "$CHROMIUM_BIN" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: chromium not found" >&2
  echo "   context: {\"version\":\"$CHROMIUM_VERSION\",\"searchPath\":\"~/.cache/ms-playwright\"}" >&2
  echo "   hint: run npx playwright install chromium" >&2
  exit 2
fi

# common flags to suppress notifications and prompts
CHROME_FLAGS=(
  --remote-debugging-port=$CDP_PORT
  --no-first-run
  --no-default-browser-check
  --user-data-dir="$USER_DATA_DIR"      # clean profile (no crash state)
  --disable-infobars                    # suppress "Google API keys" bar
  --disable-session-crashed-bubble      # suppress "Restore pages?" prompt
  --hide-crash-restore-bubble           # another way to suppress restore prompt
  --disable-features=Translate          # suppress translate prompts
  --disable-save-password-bubble        # suppress "Save password?" prompt
  --password-store=basic                # use basic store (no prompts)
)

# extra headless flags for ci/container/root environments
# .why = chrome aborts (core dumped) under root or limited /dev/shm without these
#        - --no-sandbox: sandbox cannot init as root (ci runners)
#        - --disable-dev-shm-usage: avoid crashes from small /dev/shm in containers
HEADLESS_FLAGS=(
  --no-sandbox
  --disable-dev-shm-usage
)

# launch chromium directly (not via playwright) so it stays alive after skill exits
if [[ "$MODE" == "HEADLESS" ]]; then
  nohup "$CHROMIUM_BIN" --headless "${HEADLESS_FLAGS[@]}" "${CHROME_FLAGS[@]}" > /dev/null 2>&1 &
else
  nohup "$CHROMIUM_BIN" "${CHROME_FLAGS[@]}" > /dev/null 2>&1 &
fi

# wait for CDP to become ready via named orchestrator
wait_for_cdp_ready "$CDP_PORT"

# fetch ws endpoint
WS_ENDPOINT=$(extract_ws_endpoint_from_cdp_json "$CDP_PORT")

if [[ -z "$WS_ENDPOINT" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ MalfunctionError: failed to get ws endpoint from CDP" >&2
  echo "   context: {\"port\":$CDP_PORT,\"session\":\"$SESSION\"}" >&2
  echo "   hint: browser may have crashed at startup" >&2
  exit 1
fi

# write endpoint to state file
mkdir -p "$(dirname "$WSENDPOINT_FILE")"
echo "$WS_ENDPOINT" > "$WSENDPOINT_FILE"

echo "🦎 lets get some sun"
echo ""
echo "📽️ browser.start"
echo "   ├─ session: $SESSION"
echo "   ├─ mode: $MODE"
echo "   ├─ port: $CDP_PORT"
echo "   ├─ wsEndpoint: $WS_ENDPOINT"
echo "   ├─ state: $WSENDPOINT_FILE"
echo "   │"
echo "   ├─ tests will auto-discover and reuse this window"
echo "   │"
echo "   └─ to stop: rhx browser.stop --session $SESSION"
