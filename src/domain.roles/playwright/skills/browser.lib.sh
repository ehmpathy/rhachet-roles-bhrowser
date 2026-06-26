#!/usr/bin/env bash
######################################################################
# .what = shared library for browser skills
#
# .why  = DRY: common session/endpoint/output logic in one place
#
# usage:
#   source "$(dirname "${BASH_SOURCE[0]}")/browser.lib.sh"
#   browser_init_session "mysession"
#   browser_require_endpoint
#   browser_init_output 0
######################################################################

# failloud: trap errors and output exactly why we failed
# .why = set -e kills skill silently; trap makes it loud
trap '_browser_failloud_handler $? $LINENO "$BASH_COMMAND"' ERR

_browser_failloud_handler() {
  local exit_code="$1"
  local line_number="$2"
  local failed_command="$3"
  local skill_file="${BASH_SOURCE[1]:-unknown}"

  echo "" >&2
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ MalfunctionError: command failed" >&2
  echo "   skill: $skill_file" >&2
  echo "   line: $line_number" >&2
  echo "   command: $failed_command" >&2
  echo "   exit_code: $exit_code" >&2
  echo "" >&2

  exit 1
}

# named transformer: strip ANSI escape codes from output
strip_ansi_codes() {
  sed 's/\x1b\[[0-9;]*m//g'
}

# named transformer: check if arg is a passthrough value (not a flag)
# returns 0 (true) if next arg exists and is not a flag, 1 (false) otherwise
is_passthrough_value() {
  local next_arg="${1:-}"
  [[ -n "$next_arg" && "$next_arg" != --* && "$next_arg" != -* ]]
}

# named transformer: get session hash (first 4 chars of md5)
get_session_hash() {
  local session="$1"
  echo -n "$session" | md5sum | cut -c1-4
}

# named transformer: get absolute tab index from possibly negative index
get_absolute_tab_index() {
  local tab_index="$1"
  local tab_count="$2"
  if [[ "$tab_index" -lt 0 ]]; then
    echo $((tab_count + tab_index))
    return
  fi
  echo "$tab_index"
}

# named transformer: check if tab selection is absent (neither --tab nor --focused)
is_tab_selection_absent() {
  [[ -z "${TAB_INDEX:-}" && -z "${USE_FOCUSED_TAB:-}" ]]
}

# named transformer: check if focused tab index result is invalid
is_invalid_focused_tab_index() {
  local tab_index="$1"
  [[ -z "$tab_index" || "$tab_index" == "-1" ]]
}

# session cache directory (CACHE_ROOT overridable for tests)
browser_init_session() {
  local session="${1:-default}"
  CACHE_ROOT="${CACHE_ROOT:-.cache}"
  SESSION="$session"
  SESSION_DIR="$CACHE_ROOT/browser.$SESSION"
  WSENDPOINT_FILE="$SESSION_DIR/ws-endpoint"
}

# auto-discover browser ws endpoint from state file
browser_discover_endpoint() {
  if [[ -z "${BROWSER_WS_ENDPOINT:-}" && -f "$WSENDPOINT_FILE" ]]; then
    BROWSER_WS_ENDPOINT=$(cat "$WSENDPOINT_FILE")
  fi
}

# require BROWSER_WS_ENDPOINT or fail
browser_require_endpoint() {
  browser_discover_endpoint
  if [[ -z "${BROWSER_WS_ENDPOINT:-}" ]]; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: no browser found" >&2
    echo "   context: {\"session\":\"$SESSION\"}" >&2
    echo "   hint: start a browser first via: rhx browser.start --session $SESSION --mode HEADFUL" >&2
    exit 2
  fi
}

# generate output prefix with timestamp
browser_init_output() {
  local tab_index="$1"
  if [[ -z "${OUTPUT_PREFIX:-}" ]]; then
    ISOTIME=$(date -u +%Y%m%dT%H%M%SZ)
    OUTPUT_PREFIX="$SESSION_DIR/snapshot.$ISOTIME.tab$tab_index"
    mkdir -p "$OUTPUT_PREFIX"
  fi
}

# validate tab index exists
# .note - --tab is ABSOLUTE position in pages array
# .note - --url is VERIFICATION only (not a filter to find tabs)
browser_validate_tab() {
  local tab_index="$1"
  local tab_count node_exit_code
  # .note = capture exit code explicitly (command substitution swallows it)
  tab_count=$(NO_COLOR=1 FORCE_COLOR=0 node --no-warnings -e "
    const { chromium } = require('playwright');

    // named transformer: get page count from browser
    const getPageCount = async (browser) =>
      browser.contexts().flatMap(c => c.pages()).length;

    // named transformer: extract first 3 trace lines from stack (skip message line at index 0)
    const asFirstThreeTraceLines = (stack) => {
      const lines = stack?.split('\\n') || [];
      return lines.slice(1, 4);
    };

    // named transformer: format error stack for tree output
    const formatErrorStack = (stack) => {
      const traceLines = asFirstThreeTraceLines(stack);
      return traceLines.join('\\n      ');
    };

    // named transformer: check if error is connection/constraint error
    const isConnectionError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return msg.includes('connection refused') || msg.includes('connect') || msg.includes('econnrefused');
    };

    // named transformer: format error with full context for output
    const formatErrorWithContext = (error) => {
      const errorClass = isConnectionError(error) ? 'ConstraintError' : 'MalfunctionError';
      const parts = ['🦎 cold snap', '', '✋ ' + errorClass + ': browser connection failed'];
      parts.push('   context: ' + JSON.stringify({ message: error.message }));
      parts.push('   hint: verify browser is active via: rhx browser.describe --session $SESSION');
      return parts.join('\\n');
    };

    // named transformer: determine semantic exit code from error type
    const determineExitCodeForError = (error) => {
      // connection error = constraint (caller must start browser) = exit 2
      // other errors = malfunction = exit 1
      return isConnectionError(error) ? 2 : 1;
    };

    (async () => {
      const browser = await chromium.connectOverCDP('$BROWSER_WS_ENDPOINT');
      const count = await getPageCount(browser);
      process.stdout.write(String(count));
      await browser.close();
    // .note = process boundary handler: errors surfaced with full context (not hidden)
    })().catch(err => {
      console.error(formatErrorWithContext(err));
      process.exit(determineExitCodeForError(err));
    });
  " | strip_ansi_codes) || node_exit_code=$?

  # propagate node exit code if it failed
  # .note = node already emitted error to stderr, just propagate code
  if [[ ${node_exit_code:-0} -ne 0 ]]; then
    exit "${node_exit_code}"
  fi

  # compute absolute index via named transformer
  local abs_index
  abs_index=$(get_absolute_tab_index "$tab_index" "$tab_count")

  # validate absolute index is in bounds
  if [[ "$abs_index" -lt 0 || "$abs_index" -ge "$tab_count" ]]; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: tab not found" >&2
    echo "   context: {\"tabIndex\":$tab_index,\"absoluteIndex\":$abs_index,\"availableTabs\":\"0 to $((tab_count - 1))\"}" >&2
    echo "   hint: run browser.describe to list tabs" >&2
    exit 2
  fi
}

# derive CDP port from session name hash (9222-9999 range)
browser_cdp_port() {
  local session="${1:-$SESSION}"
  local hash=$(get_session_hash "$session")
  echo $((9222 + (16#$hash % 778)))
}

# get browser.action args
# sets: PLAYBOOK, TAB_INDEX, SESSION
browser_get_action_args() {
  PLAYBOOK=""
  TAB_INDEX="0"
  SESSION="default"
  while [[ $# -gt 0 ]]; do
    case $1 in
      --play) PLAYBOOK="$2"; shift 2 ;;
      --tab) TAB_INDEX="$2"; shift 2 ;;
      --session) SESSION="$2"; shift 2 ;;
      --repo|--role|--skill|--local|--global)
        shift
        if is_passthrough_value "${1:-}"; then shift; fi
        ;;
      --) shift ;;
      *) shift ;;
    esac
  done
}

# get browser.start args
# sets: MODE, SESSION, REFRESH
browser_get_start_args() {
  MODE=""
  SESSION="default"
  REFRESH=""
  while [[ $# -gt 0 ]]; do
    case $1 in
      --mode) MODE="$2"; shift 2 ;;
      --session) SESSION="$2"; shift 2 ;;
      --refresh) REFRESH="true"; shift ;;
      *) shift ;;
    esac
  done
}

# get browser.stop args
# sets: SESSION
browser_get_stop_args() {
  SESSION="default"
  while [[ $# -gt 0 ]]; do
    case $1 in
      --session) SESSION="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
}

# get browser.describe args
# sets: SESSION
browser_get_describe_args() {
  SESSION="default"
  while [[ $# -gt 0 ]]; do
    case $1 in
      --session) SESSION="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
}

# get browser.session main args
# sets: SUBCOMMAND, SESSION, FROM_SOURCE
browser_get_session_main_args() {
  SUBCOMMAND=""
  SESSION=""
  FROM_SOURCE=""
  while [[ $# -gt 0 ]]; do
    case $1 in
      get|set|del)
        SUBCOMMAND="$1"
        shift
        ;;
      --session) SESSION="$2"; shift 2 ;;
      --from) FROM_SOURCE="$2"; shift 2 ;;
      --repo|--role|--skill|--local|--global)
        shift
        if is_passthrough_value "${1:-}"; then shift; fi
        ;;
      --) shift ;;
      *) shift ;;
    esac
  done
}

# get browser.snapshot main args
# sets: SUBCOMMAND, TAB_INDEX, EXPECTED_URL, SESSION, OUTPUT_PREFIX, USE_FOCUSED_TAB
browser_get_snapshot_main_args() {
  SUBCOMMAND=""
  TAB_INDEX=""
  EXPECTED_URL=""
  SESSION="default"
  OUTPUT_PREFIX=""
  USE_FOCUSED_TAB=""
  while [[ $# -gt 0 ]]; do
    case $1 in
      screenshot|screen|html|meta|console|network|storage)
        SUBCOMMAND="$1"
        shift
        ;;
      --tab) TAB_INDEX="$2"; shift 2 ;;
      --focused) USE_FOCUSED_TAB="true"; shift ;;
      --url) EXPECTED_URL="$2"; shift 2 ;;
      --session) SESSION="$2"; shift 2 ;;
      --output) OUTPUT_PREFIX="$2"; shift 2 ;;
      --repo|--role|--skill|--local|--global)
        shift
        if is_passthrough_value "${1:-}"; then shift; fi
        ;;
      --) shift ;;
      *) shift ;;
    esac
  done
}

# get common snapshot subcommand args
# sets: TAB_INDEX, OUTPUT_PREFIX, SESSION, STANDALONE_MODE, AWAIT_STATE, EXPECTED_URL, USE_FOCUSED_TAB
browser_get_snapshot_args() {
  STANDALONE_MODE=""
  AWAIT_STATE=""
  EXPECTED_URL=""
  USE_FOCUSED_TAB=""
  if [[ -z "${TAB_INDEX:-}" ]]; then
    STANDALONE_MODE="true"
    while [[ $# -gt 0 ]]; do
      case $1 in
        --tab) TAB_INDEX="$2"; shift 2 ;;
        --focused) USE_FOCUSED_TAB="true"; shift ;;
        --output) OUTPUT_PREFIX="$2"; shift 2 ;;
        --session) SESSION="$2"; shift 2 ;;
        --await) AWAIT_STATE="$2"; shift 2 ;;
        --url) EXPECTED_URL="$2"; shift 2 ;;
        *) shift ;;
      esac
    done

    # require --tab+--url OR --focused
    if is_tab_selection_absent; then
      echo "🦎 cold snap" >&2
      echo "" >&2
      echo "✋ ConstraintError: --focused OR (--tab + --url) required" >&2
      echo "   hint: use --focused for active tab or --tab N --url 'pattern' for specific tab" >&2
      echo "   │" >&2
      echo "   └─ usage" >&2
      echo "      ├─ rhx browser.snapshot --focused                     # snapshot focused tab" >&2
      echo "      └─ rhx browser.snapshot --tab 0 --url 'example.com'   # snapshot by index" >&2
      exit 2
    fi

    browser_init_session "${SESSION:-default}"
    browser_require_endpoint

    # if --focused, find the focused tab
    if [[ -n "${USE_FOCUSED_TAB:-}" ]]; then
      local find_exit_code get_url_exit_code
      # .note = capture exit code explicitly (command substitution swallows it)
      TAB_INDEX=$(browser_find_focused_tab) || find_exit_code=$?
      # propagate exit code if node command failed
      if [[ ${find_exit_code:-0} -ne 0 ]]; then
        exit "${find_exit_code}"
      fi
      if is_invalid_focused_tab_index "$TAB_INDEX"; then
        echo "🦎 cold snap" >&2
        echo "" >&2
        echo "✋ ConstraintError: no focused tab found" >&2
        echo "   hint: run browser.describe to list tabs or specify --tab N --url pattern" >&2
        exit 2
      fi
      # get the URL of the focused tab for output
      # .note = capture exit code explicitly (command substitution swallows it)
      EXPECTED_URL=$(browser_get_tab_url "$TAB_INDEX") || get_url_exit_code=$?
      # propagate exit code if node command failed
      if [[ ${get_url_exit_code:-0} -ne 0 ]]; then
        exit "${get_url_exit_code}"
      fi
    else
      # require --url with --tab (pit-of-success)
      if [[ -z "${EXPECTED_URL:-}" ]]; then
        echo "🦎 cold snap" >&2
        echo "" >&2
        echo "✋ ConstraintError: --url required with --tab" >&2
        echo "   hint: run browser.describe to find the tab URL" >&2
        echo "   │" >&2
        echo "   └─ usage" >&2
        echo "      ├─ rhx browser.describe                               # find the tab URL" >&2
        echo "      └─ rhx browser.snapshot --focused                     # or use focused tab" >&2
        exit 2
      fi
      browser_validate_tab "$TAB_INDEX"
      browser_verify_tab_url "$TAB_INDEX" "$EXPECTED_URL"
    fi

    browser_init_output "$TAB_INDEX"
  fi
}

# find the focused tab index
browser_find_focused_tab() {
  node --no-warnings -e "
    const { chromium } = require('playwright');

    // named transformer: get all pages from browser
    const getAllPages = (browser) => browser.contexts().flatMap(c => c.pages());

    // named transformer: check if error is expected context/evaluation error
    const isExpectedContextError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return (
        msg.includes('context') ||
        msg.includes('destroyed') ||
        msg.includes('target closed') ||
        msg.includes('execution context') ||
        msg.includes('navigation')
      );
    };

    // named transformer: check if page has document focus
    const checkPageFocus = async (page) => {
      try {
        return await page.evaluate(() => document.hasFocus());
      } catch (err) {
        if (!isExpectedContextError(err)) throw err; // rethrow unexpected errors
        // expected context error (crashed/navigated) - treat as not focused
        return false;
      }
    };

    // named transformer: find index of focused page
    const findFocusedPageIndex = async (pages) => {
      for (let i = 0; i < pages.length; i++) {
        const hasFocus = await checkPageFocus(pages[i]);
        if (hasFocus) return i;
      }
      // fallback: last page if none focused
      return pages.length - 1;
    };

    // named transformer: extract first 3 trace lines from stack (skip message line at index 0)
    const asFirstThreeTraceLines = (stack) => {
      const lines = stack?.split('\\n') || [];
      return lines.slice(1, 4);
    };

    // named transformer: format error stack for tree output
    const formatErrorStack = (stack) => {
      const traceLines = asFirstThreeTraceLines(stack);
      return traceLines.join('\\n      ');
    };

    // named transformer: check if error is connection/constraint error
    const isConnectionError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return msg.includes('connection refused') || msg.includes('connect') || msg.includes('econnrefused');
    };

    // named transformer: format error with full context for output
    const formatErrorWithContext = (error) => {
      const errorClass = isConnectionError(error) ? 'ConstraintError' : 'MalfunctionError';
      const parts = ['🦎 cold snap', '', '✋ ' + errorClass + ': browser connection failed'];
      parts.push('   context: ' + JSON.stringify({ message: error.message }));
      parts.push('   hint: verify browser is active via: rhx browser.describe --session $SESSION');
      return parts.join('\\n');
    };

    // named transformer: determine semantic exit code from error type
    const determineExitCodeForError = (error) => {
      // connection error = constraint (caller must start browser) = exit 2
      // other errors = malfunction = exit 1
      return isConnectionError(error) ? 2 : 1;
    };

    (async () => {
      const browser = await chromium.connectOverCDP('$BROWSER_WS_ENDPOINT');
      const pages = getAllPages(browser);
      const focusedIndex = await findFocusedPageIndex(pages);
      process.stdout.write(String(focusedIndex));
      await browser.close();
    // .note = process boundary handler: errors surfaced with full context (not hidden)
    })().catch(err => {
      console.error(formatErrorWithContext(err));
      process.exit(determineExitCodeForError(err));
    });
  "
}

# get URL of a specific tab
browser_get_tab_url() {
  local tab_index="$1"
  node --no-warnings -e "
    const { chromium } = require('playwright');

    // named transformer: get all pages from browser
    const getAllPages = (browser) => browser.contexts().flatMap(c => c.pages());

    // named transformer: get page at index (handles negative)
    const getPageAtIndex = (pages, index) => {
      const absIndex = index < 0 ? pages.length + index : index;
      return pages[absIndex];
    };

    // named transformer: strip https:// prefix from URL
    const stripHttpsPrefix = (url) => url.replace('https://', '');

    // named transformer: check if error is connection/constraint error
    const isConnectionError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return msg.includes('connection refused') || msg.includes('connect') || msg.includes('econnrefused');
    };

    // named transformer: format error with full context for output
    const formatErrorWithContext = (error) => {
      const errorClass = isConnectionError(error) ? 'ConstraintError' : 'MalfunctionError';
      const parts = ['🦎 cold snap', '', '✋ ' + errorClass + ': browser connection failed'];
      parts.push('   context: ' + JSON.stringify({ message: error.message }));
      parts.push('   hint: verify browser is active via: rhx browser.describe --session $SESSION');
      return parts.join('\\n');
    };

    // named transformer: determine semantic exit code from error type
    const determineExitCodeForError = (error) => {
      // connection error = constraint (caller must start browser) = exit 2
      // other errors = malfunction = exit 1
      return isConnectionError(error) ? 2 : 1;
    };

    (async () => {
      const browser = await chromium.connectOverCDP('$BROWSER_WS_ENDPOINT');
      const pages = getAllPages(browser);
      const page = getPageAtIndex(pages, parseInt('$tab_index', 10));
      const url = page ? stripHttpsPrefix(page.url()) : '';
      process.stdout.write(url);
      await browser.close();
    // .note = process boundary handler: errors surfaced with full context (not hidden)
    })().catch(err => {
      console.error(formatErrorWithContext(err));
      process.exit(determineExitCodeForError(err));
    });
  "
}

# verify tab URL matches expected (VERIFICATION, not filter)
# .note - --url is a VERIFICATION KEY to confirm you have the right tab
# .note - --url does NOT search/filter tabs; --tab is the ABSOLUTE index
browser_verify_tab_url() {
  local tab_index="$1"
  local expected_url="$2"
  local actual_url node_exit_code
  # .note = capture exit code explicitly (command substitution swallows it)
  actual_url=$(NO_COLOR=1 FORCE_COLOR=0 node --no-warnings -e "
    const { chromium } = require('playwright');

    // named transformer: get all pages from browser
    const getAllPages = (browser) => browser.contexts().flatMap(c => c.pages());

    // named transformer: get page at index (handles negative)
    const getPageAtIndex = (pages, index) => {
      const absIndex = index < 0 ? pages.length + index : index;
      return pages[absIndex];
    };

    // named transformer: check if error is connection/constraint error
    const isConnectionError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return msg.includes('connection refused') || msg.includes('connect') || msg.includes('econnrefused');
    };

    // named transformer: format error with full context for output
    const formatErrorWithContext = (error) => {
      const errorClass = isConnectionError(error) ? 'ConstraintError' : 'MalfunctionError';
      const parts = ['🦎 cold snap', '', '✋ ' + errorClass + ': browser connection failed'];
      parts.push('   context: ' + JSON.stringify({ message: error.message }));
      parts.push('   hint: verify browser is active via: rhx browser.describe --session $SESSION');
      return parts.join('\\n');
    };

    // named transformer: determine semantic exit code from error type
    const determineExitCodeForError = (error) => {
      // connection error = constraint (caller must start browser) = exit 2
      // other errors = malfunction = exit 1
      return isConnectionError(error) ? 2 : 1;
    };

    (async () => {
      const browser = await chromium.connectOverCDP('$BROWSER_WS_ENDPOINT');
      const pages = getAllPages(browser);
      const page = getPageAtIndex(pages, parseInt('$tab_index', 10));
      const url = page ? page.url() : '';
      process.stdout.write(url);
      await browser.close();
    // .note = process boundary handler: errors surfaced with full context (not hidden)
    })().catch(err => {
      console.error(formatErrorWithContext(err));
      process.exit(determineExitCodeForError(err));
    });
  " | strip_ansi_codes) || node_exit_code=$?

  # propagate node exit code if it failed
  # .note = node already emitted error to stderr, just propagate code
  if [[ ${node_exit_code:-0} -ne 0 ]]; then
    exit "${node_exit_code}"
  fi

  # strip https:// prefix from both URLs for comparison
  local actual_url_normalized="${actual_url#https://}"
  local expected_url_normalized="${expected_url#https://}"

  # exact match required (--url is verification, not filter)
  if [[ "$actual_url_normalized" != "$expected_url_normalized" ]]; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ ConstraintError: URL verification failed" >&2
    echo "   context: {\"tab\":$tab_index,\"expected\":\"$expected_url_normalized\",\"actual\":\"$actual_url_normalized\"}" >&2
    echo "   hint: verify you selected the correct tab via: rhx browser.describe --session $SESSION" >&2
    exit 2
  fi
}

# keepalive heartbeat to prevent CDP timeout
browser_keepalive() {
  node --no-warnings -e "
    const { chromium } = require('playwright');

    // named transformer: get all pages from browser
    const getAllPages = (browser) => browser.contexts().flatMap(c => c.pages());

    // named transformer: send heartbeat to page
    const sendHeartbeat = async (page) => {
      await page.evaluate(() => 1);
    };

    // named transformer: check if error is connection/constraint error
    const isConnectionError = (error) => {
      const msg = error?.message?.toLowerCase() ?? '';
      return msg.includes('connection refused') || msg.includes('connect') || msg.includes('econnrefused');
    };

    // named transformer: format error with full context for output
    const formatErrorWithContext = (error) => {
      const errorClass = isConnectionError(error) ? 'ConstraintError' : 'MalfunctionError';
      const parts = ['🦎 cold snap', '', '✋ ' + errorClass + ': keepalive failed'];
      parts.push('   context: ' + JSON.stringify({ message: error.message }));
      parts.push('   hint: browser may have closed or crashed');
      return parts.join('\\n');
    };

    // named transformer: determine semantic exit code from error type
    const determineExitCodeForError = (error) => {
      // connection error = constraint (caller must restart browser) = exit 2
      // other errors = malfunction = exit 1
      return isConnectionError(error) ? 2 : 1;
    };

    (async () => {
      const browser = await chromium.connectOverCDP('$BROWSER_WS_ENDPOINT');
      const pages = getAllPages(browser);
      if (pages.length > 0) {
        await sendHeartbeat(pages[0]);
      }
      await browser.close();
    // .note = process boundary handler: errors surfaced with full context (not hidden)
    })().catch(err => {
      console.error(formatErrorWithContext(err));
      process.exit(determineExitCodeForError(err));
    });
  "
}

# check if --help flag is present in args
browser_has_help_flag() {
  for arg in "$@"; do
    if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
      return 0
    fi
  done
  return 1
}

# emit help for a skill
# usage: browser_emit_help "skill-name" "purpose" "usage" "options..."
# options format: "  --flag: description"
browser_emit_help() {
  local skill_name="$1"
  local purpose="$2"
  local usage="$3"
  shift 3

  echo "🦎 lets get some sun..."
  echo ""
  echo "📽️ $skill_name --help"
  echo "   ├─ purpose: $purpose"
  echo "   ├─ usage: $usage"
  echo "   └─ options"

  local last_index=$(($# - 1))
  local i=0
  for option in "$@"; do
    if [[ $i -eq $last_index ]]; then
      echo "      └─ $option"
    else
      echo "      ├─ $option"
    fi
    i=$((i + 1))
  done

  exit 0
}

# lizard vibes output functions
browser_output_header() {
  local skill="$1"
  local vibe="$2"
  echo "🦎 $vibe"
  echo ""
  echo "📽️ $skill"
}

browser_output_field() {
  local prefix="$1"
  local key="$2"
  local value="$3"
  echo "   ${prefix} ${key}: ${value}"
}
