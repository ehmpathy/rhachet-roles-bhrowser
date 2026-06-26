#!/usr/bin/env bash
######################################################################
# .what = capture diagnostic snapshot of browser tab
#
# .why  = single command captures full debug context:
#         - screenshot, html, console, network, storage, metadata
#         - collocated files for easy correlation
#         - enables async debug (snapshot now, analyze later)
#
# .pit-of-success:
#   requires --focused OR (--tab AND --url) to prevent wrong-tab mistakes.
#   if unsure which tab, run browser.describe first.
#
# .important:
#   --tab N    = ABSOLUTE index (tab 4 means the 4th tab, period)
#   --url 'x'  = VERIFICATION key (asserts tab N has this URL, fails if not)
#   --url is NOT a filter; it does NOT search for tabs that match the URL
#
# usage:
#   rhx browser.snapshot --focused                                               # snapshot focused tab
#   rhx browser.snapshot --tab -1 --url 'account.squarespace.com/domains'        # snapshot by index
#   rhx browser.snapshot screen --focused                                        # just screenshot
#
# output:
#   .cache/browser.$session/snapshot.$isotime.tab$tab/
#   ├── snapshot.meta.json
#   ├── snapshot.png
#   ├── snapshot.html
#   ├── snapshot.console.json
#   ├── snapshot.network.json
#   └── snapshot.storage.json
#
# guarantee:
#   - auto-discovers browser from state file
#   - fail-fast if --tab not supplied
#   - fail-fast if --url not supplied (run browser.describe first)
#   - fail-fast if tab URL doesn't match --url
#   - fail-fast if no browser found
######################################################################

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SKILL_DIR/browser.lib.sh"

# handle --help flag
if browser_has_help_flag "$@"; then
  browser_emit_help \
    "browser.snapshot" \
    "capture diagnostic snapshot of browser tab" \
    "browser.snapshot [subcommand] --focused | --tab N --url 'pattern'" \
    "--help: show this message" \
    "--focused: snapshot the focused tab" \
    "--tab N: tab index (0-based, negative from end)" \
    "--url 'pattern': verify tab URL contains pattern (required with --tab)" \
    "--session NAME: browser session name (default: default)" \
    "--output PATH: output directory prefix" \
    "subcommands: screen, html, meta, console, network, storage"
fi

# named transformer: get tree prefix for index in array
get_tree_prefix() {
  local index="$1"
  local total="$2"
  if [[ $index -eq $((total - 1)) ]]; then
    echo "   │  └─"
    return
  fi
  echo "   │  ├─"
}

# named transformer: format items as tree list
format_as_tree_list() {
  local items=("$@")
  local count=${#items[@]}
  for i in "${!items[@]}"; do
    local prefix
    prefix=$(get_tree_prefix "$i" "$count")
    echo "$prefix ${items[$i]}"
  done
}

# named transformer: check if array has any elements
has_any_elements() {
  local -n arr_ref=$1
  [[ ${#arr_ref[@]} -gt 0 ]]
}

# named transformer: join array elements with space separator
as_space_joined() {
  local -n arr_ref=$1
  echo "${arr_ref[*]}"
}

# parse args via named function
browser_get_snapshot_main_args "$@"

# named transformer: check if tab selection is absent
is_tab_selection_absent() {
  [[ -z "$TAB_INDEX" && -z "$USE_FOCUSED_TAB" ]]
}

# named orchestrator: validate args and determine tab selection
# sets: TAB_INDEX, EXPECTED_URL
validate_and_set_tab_selection() {
  # require --focused OR --tab
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

  browser_init_session "$SESSION"
  browser_require_endpoint

  # handle --focused mode
  if [[ -n "$USE_FOCUSED_TAB" ]]; then
    TAB_INDEX=$(browser_find_focused_tab)
    if is_invalid_focused_tab_index "$TAB_INDEX"; then
      echo "🦎 cold snap" >&2
      echo "" >&2
      echo "✋ ConstraintError: no focused tab found" >&2
      echo "   hint: run browser.describe to list tabs or specify --tab N --url pattern" >&2
      exit 2
    fi
    EXPECTED_URL=$(browser_get_tab_url "$TAB_INDEX")
    return
  fi

  # handle --tab mode (requires --url for verification)
  if [[ -z "$EXPECTED_URL" ]]; then
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
}

validate_and_set_tab_selection

browser_init_output "$TAB_INDEX"

# named transformer: canonicalize snapshot subcommand alias
as_canonical_snapshot_subcommand() {
  local subcommand="$1"
  case "$subcommand" in
    screenshot) echo "screen" ;;
    *) echo "$subcommand" ;;
  esac
}

# canonicalize subcommand alias via named transformer
SUBCOMMAND=$(as_canonical_snapshot_subcommand "$SUBCOMMAND")

# track constraint failures for summary (module-level for orchestrators)
CONSTRAINT_FAILURES=()

# named executor: run sub-skill (output flows through, returns exit code)
run_subskill() {
  local skill="$1"
  bash "$SKILL_DIR/browser.snapshot.$skill.sh"
}

# named transformer: check if exit code indicates malfunction
is_malfunction_exit() {
  local exit_code="$1"
  [[ "$exit_code" -eq 1 ]]
}

# named transformer: check if exit code indicates constraint
is_constraint_exit() {
  local exit_code="$1"
  [[ "$exit_code" -eq 2 ]]
}

# named transformer: check if exit code indicates success
is_success_exit() {
  local exit_code="$1"
  [[ "$exit_code" -eq 0 ]]
}

# named transformer: append skill to constraint failures list
# .note = deliberate mutation: accumulates failure state across sub-skill calls
append_constraint_failure() {
  local skill="$1"
  CONSTRAINT_FAILURES+=("$skill")
}

# named orchestrator: run critical sub-skill (exits on any failure)
run_critical_subskill() {
  local skill="$1"
  local exit_code=0
  run_subskill "$skill" || exit_code=$?
  if ! is_success_exit "$exit_code"; then
    exit "$exit_code"
  fi
}

# named orchestrator: run non-critical sub-skill (continues on constraint, fails on malfunction)
run_noncritical_subskill() {
  local skill="$1"
  local exit_code=0
  run_subskill "$skill" || exit_code=$?

  if is_malfunction_exit "$exit_code"; then
    echo "🦎 cold snap" >&2
    echo "" >&2
    echo "✋ MalfunctionError: browser.snapshot.$skill failed" >&2
    echo "   hint: check sub-skill output above for details" >&2
    exit 1
  fi

  if is_constraint_exit "$exit_code"; then
    append_constraint_failure "$skill"
  fi
}

# named orchestrator: run all critical sub-skills
run_all_critical_subskills() {
  run_critical_subskill "meta"
  run_critical_subskill "screen"
  run_critical_subskill "html"
}

# named orchestrator: run all non-critical sub-skills
run_all_noncritical_subskills() {
  run_noncritical_subskill "console"
  run_noncritical_subskill "storage"
  run_noncritical_subskill "network"
}

# named transformer: emit header for all-subskills mode
emit_snapshot_header() {
  echo "🦎 toasty"
  echo ""
  echo "📽️ browser.snapshot"
  echo "   ├─ session: $SESSION"
  echo "   ├─ tab: $TAB_INDEX"
  echo "   │"
}

# named transformer: emit output file list
emit_output_file_list() {
  echo "   │"
  echo "   ├─ output"
  local files=("$OUTPUT_PREFIX/"*)
  format_as_tree_list "${files[@]}"
  echo "   │"
}

# named transformer: emit partial completion status with failures
emit_partial_completion() {
  local failures_list
  failures_list=$(as_space_joined CONSTRAINT_FAILURES)
  echo "   ├─ unavailable: $failures_list" >&2
  echo "   │  hint: some data sources were not accessible" >&2
  echo "   │" >&2
  echo "   └─ partial (exit 2)" >&2
}

# named orchestrator: emit completion status and exit appropriately
emit_completion_and_exit() {
  if has_any_elements CONSTRAINT_FAILURES; then
    emit_partial_completion
    exit 2
  fi
  echo "   └─ done"
}

# named orchestrator: run single sub-skill by name
# .note = passes parsed args so sub-skill runs standalone with full headers
run_single_subskill() {
  local subcommand="$1"
  local args=()
  args+=(--tab "$TAB_INDEX")
  args+=(--url "$EXPECTED_URL")
  args+=(--session "$SESSION")
  args+=(--output "$OUTPUT_PREFIX")
  bash "$SKILL_DIR/browser.snapshot.$subcommand.sh" "${args[@]}"
}

# named orchestrator: run all sub-skills with full output
run_all_subskills() {
  emit_snapshot_header
  run_all_critical_subskills
  run_all_noncritical_subskills
  emit_output_file_list
  emit_completion_and_exit
}

# named transformer: check if subcommand is specified
has_subcommand() {
  [[ -n "$SUBCOMMAND" ]]
}

# dispatch: run single subcommand or all subskills
# .note = single subcommand mode: do NOT export TAB_INDEX so sub-skill runs standalone
#         (has full headers like 🦎 toasty). composite mode: export TAB_INDEX so
#         sub-skills emit tree items only (parent handles headers).
if has_subcommand; then
  run_single_subskill "$SUBCOMMAND"
  exit
fi

# export for sub-scripts only in composite mode
export BROWSER_WS_ENDPOINT
export TAB_INDEX
export OUTPUT_PREFIX

run_all_subskills
