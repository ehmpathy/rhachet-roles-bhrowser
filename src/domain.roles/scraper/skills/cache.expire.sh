#!/usr/bin/env bash
######################################################################
# .what = expire cache for an account (force fresh scrape on next query)
#
# .why  = trigger re-scrape when remote state has changed
#
# usage:
#   rhx cache.expire --for user@example.com --cache-dir .cache/myapp
#
# guarantee:
#   - finds all cache files for account (via email hash)
#   - deletes cache files (next query triggers fresh scrape)
#   - fail-fast on errors
######################################################################
set -euo pipefail

# handle --help flag
for arg in "$@"; do
  if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
    echo "🦎 rock solid"
    echo ""
    echo "📽️ cache.expire --help"
    echo ""
    echo "usage:"
    echo "  rhx cache.expire --for EMAIL --cache-dir PATH"
    echo ""
    echo "options:"
    echo "  --help                show this message"
    echo "  --for EMAIL           account email to expire cache for (required)"
    echo "  --cache-dir PATH      path to cache directory (required)"
    echo ""
    echo "description:"
    echo "  expires (deletes) all cache files for a given account."
    echo "  next query for this account will trigger a fresh scrape."
    echo ""
    echo "example:"
    echo "  rhx cache.expire --for user@example.com --cache-dir .cache/myapp"
    exit 0
  fi
done

# named transformer: parse cache.expire args
# sets: EMAIL, CACHE_DIR
cache_parse_expire_args() {
  EMAIL=""
  CACHE_DIR=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --for) EMAIL="$2"; shift 2 ;;
      --cache-dir) CACHE_DIR="$2"; shift 2 ;;
      --skill|--repo|--role) shift 2 ;;
      *) shift ;;
    esac
  done
}

# parse args via named function
cache_parse_expire_args "$@"

# require --for
if [[ -z "$EMAIL" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --for required" >&2
  echo "   hint: specify account email, e.g., --for user@example.com" >&2
  exit 2
fi

# require --cache-dir
if [[ -z "$CACHE_DIR" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --cache-dir required" >&2
  echo "   hint: rhx cache.expire --for user@example.com --cache-dir .cache/myapp" >&2
  exit 2
fi

# named transformer: get tree prefix for index in array
get_tree_prefix() {
  local index="$1"
  local total="$2"
  if [[ $index -eq $((total - 1)) ]]; then
    echo "      └─"
  else
    echo "      ├─"
  fi
}

# named transformer: delete single file and emit tree line
# .note = uses rm -f for idempotency (no error if file already deleted on retry)
delete_file_with_tree_line() {
  local file="$1"
  local prefix="$2"
  rm -f "$file"
  echo "$prefix $(basename "$file")"
}

# named transformer: iterate array with index and callback
# .note = extracted to avoid inline positional array access in orchestrators
iterate_files_with_index() {
  local -n arr_ref=$1
  local callback="$2"
  local count=${#arr_ref[@]}
  local idx=0
  for file in "${arr_ref[@]}"; do
    local prefix
    prefix=$(get_tree_prefix "$idx" "$count")
    $callback "$file" "$prefix"
    idx=$((idx + 1))
  done
}

# named orchestrator: delete cache files and emit tree output
delete_cache_files_with_output() {
  local -n files_ref=$1
  iterate_files_with_index files_ref delete_file_with_tree_line
}

# named transformer: compute email hash (first 12 chars of sha256)
compute_email_hash() {
  local email="$1"
  echo -n "$email" | sha256sum | cut -c1-12
}

# named transformer: find cache files for account (populates FILES array)
# uses nullglob to return empty array on no match
find_cache_files_for_account() {
  local cache_dir="$1"
  local email_hash="$2"
  shopt -s nullglob
  FILES=("$cache_dir"/*."$email_hash".*)
  shopt -u nullglob
}

EMAIL_HASH=$(compute_email_hash "$EMAIL")
find_cache_files_for_account "$CACHE_DIR" "$EMAIL_HASH"

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "🦎 cold snap"
  echo ""
  echo "📽️ cache.expire"
  echo "   ├─ account: $EMAIL"
  echo "   ├─ hash: $EMAIL_HASH"
  echo "   ├─ cache: $CACHE_DIR"
  echo "   ├─ files: 0"
  echo "   └─ hint: no cache files found for this account"
  exit 0
fi

echo "🦎 toasty"
echo ""
echo "📽️ cache.expire"
echo "   ├─ account: $EMAIL"
echo "   ├─ hash: $EMAIL_HASH"
echo "   ├─ cache: $CACHE_DIR"
echo "   ├─ files: ${#FILES[@]}"
echo "   └─ expired"

delete_cache_files_with_output FILES
