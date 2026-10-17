#!/usr/bin/env bash
source "$(dirname "$0")/touched-files.sh"
readonly BLOCKED_MESSAGE="Blocked: records of green commits are written only by scripts/verify.sh."
readonly RECORDS_PATH_PATTERN='(^|/)\.git/verify(/|$)'
readonly WRITE_PATTERN='>|(^|[^[:alnum:]_])(tee|cp|mv|rm|touch|mkdir|ln|install|dd|truncate)([^[:alnum:]_]|$)|sed[[:space:]]+-i'

normalize_path() {
  local segment normalized=""
  while IFS= read -r segment; do
    [[ -z "$segment" || "$segment" == . ]] && continue
    [[ "$segment" == .. ]] && { normalized=${normalized%/*}; continue; }
    normalized="$normalized/$segment"
  done < <(tr '/' '\n' <<<"$1")
  echo "$normalized"
}

block() {
  echo "$BLOCKED_MESSAGE" >&2
  exit 2
}

touched=$(touched_files)
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  [[ "$(normalize_path "$file")" =~ $RECORDS_PATH_PATTERN ]] && block
done <<<"$touched"
[[ -n "$touched" ]] && exit 0
command=$(jq -r '.tool_input.command // ""' <<<"$hook_input")
names_records_directory=false
writes=false
[[ "$command" == *.git/verify* ]] && names_records_directory=true
[[ "$command" =~ $WRITE_PATTERN ]] && writes=true
[[ "$names_records_directory" == true && "$writes" == true ]] && block
exit 0
