#!/usr/bin/env bash
######################################################################
# .what = extend cache ttl for an account (delay re-scrape)
#
# .why  = extend validity when remote state is known unchanged
#
# usage:
#   rhx cache.extend --for user@example.com --by PT24H --cache-dir .cache/myapp
#
# guarantee:
#   - finds all cache files for account (via email hash)
#   - extends expiresAtMse in each cache file
#   - updates valid_keys file if present
#   - fail-fast on errors
######################################################################
set -euo pipefail

# handle --help flag
for arg in "$@"; do
  if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
    echo "🦎 rock solid"
    echo ""
    echo "📽️ cache.extend --help"
    echo ""
    echo "usage:"
    echo "  rhx cache.extend --for EMAIL --by DURATION --cache-dir PATH"
    echo ""
    echo "options:"
    echo "  --help                show this message"
    echo "  --for EMAIL           account email to extend cache for (required)"
    echo "  --by DURATION         ISO 8601 duration, e.g., PT24H, PT1H30M (required)"
    echo "  --cache-dir PATH      path to cache directory (required)"
    echo ""
    echo "description:"
    echo "  extends cache ttl for a given account. sets expiresAtMse"
    echo "  to now + duration. idempotent: safe to call multiple times."
    echo ""
    echo "example:"
    echo "  rhx cache.extend --for user@example.com --by PT24H --cache-dir .cache/myapp"
    exit 0
  fi
done

# named transformer: parse cache.extend args
# sets: EMAIL, DURATION, CACHE_DIR
cache_parse_extend_args() {
  EMAIL=""
  DURATION=""
  CACHE_DIR=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --for) EMAIL="$2"; shift 2 ;;
      --by) DURATION="$2"; shift 2 ;;
      --cache-dir) CACHE_DIR="$2"; shift 2 ;;
      --skill|--repo|--role) shift 2 ;;
      *) shift ;;
    esac
  done
}

# parse args via named function
cache_parse_extend_args "$@"

# require --for
if [[ -z "$EMAIL" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --for required" >&2
  echo "   hint: specify account email, e.g., --for user@example.com" >&2
  exit 2
fi

# require --by
if [[ -z "$DURATION" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --by required" >&2
  echo "   hint: specify duration, e.g., --by PT24H, --by PT1H30M, --by PT30M" >&2
  exit 2
fi

# require --cache-dir
if [[ -z "$CACHE_DIR" ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ ConstraintError: --cache-dir required" >&2
  echo "   hint: rhx cache.extend --for user@example.com --by PT24H --cache-dir .cache/myapp" >&2
  exit 2
fi

# named transformer: get first regex capture group from BASH_REMATCH
as_first_capture_group() {
  echo "${BASH_REMATCH[1]}"
}

# named transformer: extract days from ISO duration
extract_days_ms() {
  local dur="$1"
  if [[ "$dur" =~ ([0-9]+)D ]]; then
    local days
    days=$(as_first_capture_group)
    echo $((days * 86400000))
  else
    echo 0
  fi
}

# named transformer: extract hours from ISO duration
extract_hours_ms() {
  local dur="$1"
  if [[ "$dur" =~ ([0-9]+)H ]]; then
    local hours
    hours=$(as_first_capture_group)
    echo $((hours * 3600000))
  else
    echo 0
  fi
}

# named transformer: extract minutes from ISO duration (only after T)
extract_minutes_ms() {
  local dur="$1"
  if [[ "$dur" == *T* ]]; then
    local time_part="${dur#*T}"
    if [[ "$time_part" =~ ([0-9]+)M ]]; then
      local minutes
      minutes=$(as_first_capture_group)
      echo $((minutes * 60000))
      return
    fi
  fi
  echo 0
}

# named transformer: extract seconds from ISO duration
extract_seconds_ms() {
  local dur="$1"
  if [[ "$dur" =~ ([0-9]+)S ]]; then
    local seconds
    seconds=$(as_first_capture_group)
    echo $((seconds * 1000))
  else
    echo 0
  fi
}

# parse ISO 8601 duration to milliseconds
parse_duration_to_ms() {
  local dur="$1"
  local days_ms=$(extract_days_ms "$dur")
  local hours_ms=$(extract_hours_ms "$dur")
  local minutes_ms=$(extract_minutes_ms "$dur")
  local seconds_ms=$(extract_seconds_ms "$dur")
  echo $((days_ms + hours_ms + minutes_ms + seconds_ms))
}

EXTEND_MS=$(parse_duration_to_ms "$DURATION")

if [[ "$EXTEND_MS" -eq 0 ]]; then
  echo "🦎 cold snap" >&2
  echo "" >&2
  echo "✋ BadRequestError: invalid duration format" >&2
  echo "   context: {\"given\":\"$DURATION\"}" >&2
  echo "   hint: use ISO 8601 format, e.g., PT24H, PT1H30M, PT30M, P1D" >&2
  exit 2
fi

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
  echo "📽️ cache.extend"
  echo "   ├─ account: $EMAIL"
  echo "   ├─ hash: $EMAIL_HASH"
  echo "   ├─ cache: $CACHE_DIR"
  echo "   ├─ by: $DURATION"
  echo "   ├─ files: 0"
  echo "   └─ hint: no cache files found for this account"
  exit 0
fi

echo "🦎 toasty"
echo ""
echo "📽️ cache.extend"
echo "   ├─ account: $EMAIL"
echo "   ├─ hash: $EMAIL_HASH"
echo "   ├─ cache: $CACHE_DIR"
echo "   ├─ by: $DURATION (+${EXTEND_MS}ms)"
echo "   ├─ files: ${#FILES[@]}"
echo "   └─ extended"

# named transformer: get tree prefix for index in array
# .note = indentation (6 spaces) nests under "extended" in parent tree
get_tree_prefix() {
  local index="$1"
  local total="$2"
  if [[ $index -eq $((total - 1)) ]]; then
    echo "      └─"
  else
    echo "      ├─"
  fi
}

# named transformer: extract expiresAtMse value from JSON file
extract_expires_at_mse() {
  local file="$1"
  grep -oE '"expiresAtMse":[ ]*[0-9]+' "$file" | grep -oE '[0-9]+'
}

# named transformer: update expiresAtMse value in JSON file
update_expires_at_mse() {
  local file="$1"
  local old_value="$2"
  local new_value="$3"
  sed -i -E "s/\"expiresAtMse\":[ ]*$old_value/\"expiresAtMse\": $new_value/" "$file"
}

# named transformer: extract key (first field) from valid_keys line
extract_key_from_line() {
  local line="$1"
  echo "$line" | awk '{print $1}'
}

# named transformer: extract expires (second field) from valid_keys line
extract_expires_from_line() {
  local line="$1"
  echo "$line" | awk '{print $2}'
}

# named transformer: check if cache file has expiresAtMse field
file_has_expires_field() {
  local file="$1"
  [[ "$file" == *.json ]] && grep -q '"expiresAtMse"' "$file" 2>/dev/null
}

# named transformer: check if file can be extended (has expires field with value)
can_extend_file() {
  local file="$1"
  file_has_expires_field "$file" && [[ -n "$(extract_expires_at_mse "$file")" ]]
}

# named transformer: get current timestamp in milliseconds
get_now_mse() {
  echo $(($(date +%s) * 1000))
}

# named transformer: extend file expiration and emit success line
# .note = idempotent: sets expiration to max(current, now + extend_ms) to prevent double-extend on retry
extend_file_and_emit_success() {
  local file="$1"
  local extend_ms="$2"
  local prefix="$3"
  local fname current_expires target_expires new_expires now_mse
  fname=$(basename "$file")
  current_expires=$(extract_expires_at_mse "$file")
  now_mse=$(get_now_mse)
  target_expires=$((now_mse + extend_ms))

  # idempotent: only extend if current is below target (prevents double-extend on retry)
  if [[ "$current_expires" -ge "$target_expires" ]]; then
    echo "$prefix $fname (already extended)"
    return 0
  fi

  new_expires="$target_expires"
  update_expires_at_mse "$file" "$current_expires" "$new_expires"
  echo "$prefix $fname (+${extend_ms}ms)"
}

# named transformer: emit skip line for non-extendable file
emit_skip_line() {
  local file="$1"
  local prefix="$2"
  local fname
  fname=$(basename "$file")
  echo "$prefix $fname (skipped: no expiresAtMse)"
}

# named orchestrator: extend single cache file expiration if applicable
extend_cache_file_if_expirable() {
  local file="$1"
  local extend_ms="$2"
  local prefix="$3"

  if can_extend_file "$file"; then
    extend_file_and_emit_success "$file" "$extend_ms" "$prefix"
    return 0
  fi
  emit_skip_line "$file" "$prefix"
  return 1
}

# named orchestrator: process all cache files and extend expirations
# .note = emits tree to stdout, sets EXTENDED_COUNT global
process_cache_files() {
  local -n files_ref=$1
  local extend_ms="$2"
  local count=${#files_ref[@]}
  local idx=0

  EXTENDED_COUNT=0
  for file in "${files_ref[@]}"; do
    local prefix
    prefix=$(get_tree_prefix "$idx" "$count")
    if extend_cache_file_if_expirable "$file" "$extend_ms" "$prefix"; then
      EXTENDED_COUNT=$((EXTENDED_COUNT + 1))
    fi
    idx=$((idx + 1))
  done
}

# process cache files via named orchestrator
EXTENDED_COUNT=0
process_cache_files FILES "$EXTEND_MS"

# named transformer: check if value is numeric
is_numeric() {
  local value="$1"
  [[ -n "$value" ]] && [[ "$value" =~ ^[0-9]+$ ]]
}

# named transformer: check if line matches email hash
line_matches_email_hash() {
  local line="$1"
  local hash="$2"
  [[ "$line" == *".$hash."* ]]
}

# named transformer: compute extended expiration
# .note = idempotent: returns max(old_expires, now + extend_ms)
compute_extended_expires() {
  local old_expires="$1"
  local extend_ms="$2"
  local now_mse target_expires
  now_mse=$(get_now_mse)
  target_expires=$((now_mse + extend_ms))

  if [[ "$old_expires" -ge "$target_expires" ]]; then
    echo "$old_expires"
    return
  fi
  echo "$target_expires"
}

# named transformer: process a valid_keys line and emit updated line
process_valid_keys_line() {
  local line="$1"
  local email_hash="$2"
  local extend_ms="$3"

  if ! line_matches_email_hash "$line" "$email_hash"; then
    echo "$line"
    return
  fi

  local key old_expires new_expires
  key=$(extract_key_from_line "$line")
  old_expires=$(extract_expires_from_line "$line")

  if is_numeric "$old_expires"; then
    new_expires=$(compute_extended_expires "$old_expires" "$extend_ms")
    echo "$key $new_expires"
  else
    echo "$line"
  fi
}

# named transformer: read file lines and apply callback to each
# .note = handles files that lack a final newline via || [[ -n "$line" ]]
apply_callback_to_file_lines() {
  local file="$1"
  local callback="$2"
  local callback_arg1="$3"
  local callback_arg2="$4"

  while IFS= read -r line || [[ -n "$line" ]]; do
    $callback "$line" "$callback_arg1" "$callback_arg2"
  done < "$file"
}

# named orchestrator: update valid_keys file with extended expirations
update_valid_keys_file() {
  local valid_keys_file="$1"
  local email_hash="$2"
  local extend_ms="$3"

  # valid_keys format: each line is "key expiresAtMse"
  local temp_file
  temp_file=$(mktemp)
  apply_callback_to_file_lines "$valid_keys_file" process_valid_keys_line "$email_hash" "$extend_ms" >> "$temp_file"
  mv "$temp_file" "$valid_keys_file"
}

# update valid_keys file if present
VALID_KEYS_FILE="$CACHE_DIR/valid_keys"
if [[ -f "$VALID_KEYS_FILE" ]]; then
  update_valid_keys_file "$VALID_KEYS_FILE" "$EMAIL_HASH" "$EXTEND_MS"
fi
