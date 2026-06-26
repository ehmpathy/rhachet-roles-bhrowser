#!/usr/bin/env bash
######################################################################
# .what = do browser work by hand via playbooks
#
# .when = use this skill whenever you need to:
#         - explore UI to discover selectors or URLs
#         - toggle settings or click buttons manually
#         - verify UI state (enabled vs disabled)
#         - perform one-off operations without full scrapers
#         - figure things out before you write production code
#
# .why  = enables manual browser interaction via reusable playbooks:
#         - playbooks are TypeScript files with full playwright access
#         - stored in .play/temporary/ for scratch work (gitignored)
#         - stored in .play/permanent/ for reusable sequences
#
# usage:
#   rhx browser.action --play .play/temporary/toggle-renewal.play.ts
#   rhx browser.action --play .play/permanent/goto-domains-list.play.ts
#   rhx browser.action --play .play/temporary/my-action.play.ts --tab 2
#
# playbook format (.play.ts):
#   import type { Page, Browser } from 'playwright';
#   export const action = async (input: { page: Page; browser: Browser }) => {
#     await input.page.goto('https://example.com');
#     await input.page.click('button');
#     return { success: true };
#   };
#
# guarantee:
#   - auto-discovers browser from state file
#   - fail-fast if no browser found
#   - fail-fast if playbook not found
#   - uses tab 0 by default (override with --tab)
#
# see also:
#   - howto.browser-action-playbooks.md (brief)
#   - browser.snapshot (take screenshots/html)
#   - browser.describe (list tabs)
######################################################################

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SKILL_DIR/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.action" \
    "execute browser automation playbook" \
    "browser.action --play <playbook.play.ts> [--tab N] [--session NAME]" \
    "--help: show this message" \
    "--play PATH: playbook file to execute (required)" \
    "--tab N: tab index to operate on (default: 0)" \
    "--session NAME: browser session name (default: default)"
fi

# parse args via named function
browser_get_action_args "$@"

# require --play
if [[ -z "$PLAYBOOK" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --play required" >&2
  echo "   context: {\"session\":\"${SESSION:-default}\",\"tab\":${TAB_INDEX:-0}}" >&2
  echo "   │" >&2
  echo "   ├─ usage" >&2
  echo "   │  ├─ rhx browser.action --play .play/permanent/my-playbook.play.ts" >&2
  echo "   │  └─ rhx browser.action --play .play/permanent/my-playbook.play.ts --tab 2" >&2
  echo "   │" >&2
  echo "   └─ playbook format (.play.ts)" >&2
  echo "      ├─" >&2
  echo "      │" >&2
  echo "      │  import type { Page, Browser } from 'playwright';" >&2
  echo "      │  export const action = async (input: { page: Page; browser: Browser }) => {" >&2
  echo "      │    await input.page.goto('https://example.com');" >&2
  echo "      │    return { success: true };" >&2
  echo "      │  };" >&2
  echo "      │" >&2
  echo "      └─" >&2
  exit 2
fi

# require playbook file exists
if [[ ! -f "$PLAYBOOK" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: playbook not found" >&2
  echo "   context: {\"path\":\"$PLAYBOOK\"}" >&2
  echo "   hint: verify the playbook file exists at the specified path" >&2
  exit 2
fi

browser_init_session "$SESSION"
browser_require_endpoint

# run playbook via co-located typescript module
echo "🦎 run playbook"
echo "   ├─ file: $PLAYBOOK"
echo "   ├─ tab: $TAB_INDEX"
echo "   │"

# .note = disable ERR trap for TypeScript command; TypeScript handles its own error output
#         via handleProcessBoundaryError; we just propagate the exit code
#         set +e alone is not enough — must explicitly disable the trap
trap - ERR
NO_COLOR=1 FORCE_COLOR=0 npx tsx "$SKILL_DIR/browser.action.ts" \
  --wsEndpoint "$BROWSER_WS_ENDPOINT" \
  --tabIndex "$TAB_INDEX" \
  --playbook "$PLAYBOOK" \
  --session "$SESSION"
ts_exit_code=$?
trap '_browser_failloud_handler $? $LINENO "$BASH_COMMAND"' ERR

# propagate TypeScript exit code (TypeScript already emitted error output)
if [[ $ts_exit_code -ne 0 ]]; then
  exit $ts_exit_code
fi
