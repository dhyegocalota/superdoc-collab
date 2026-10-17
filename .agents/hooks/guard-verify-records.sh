#!/usr/bin/env bash
source "$(dirname "$0")/touched-files.sh"
readonly BLOCKED_MESSAGE="Blocked: records of green commits are written only by scripts/verify.sh."
touched=$(touched_files)
if [[ "$touched" == */.git/verify/* ]]; then
  echo "$BLOCKED_MESSAGE" >&2
  exit 2
fi
[[ -n "$touched" ]] && exit 0
command=$(jq -r '.tool_input.command // ""' <<<"$hook_input")
names_records_directory=false
[[ "$command" == *.git/verify* ]] && names_records_directory=true
[[ "$command" == *git-common-dir* && "$command" == *verify* ]] && names_records_directory=true
if [[ "$names_records_directory" == true ]]; then
  echo "$BLOCKED_MESSAGE" >&2
  exit 2
fi
exit 0
