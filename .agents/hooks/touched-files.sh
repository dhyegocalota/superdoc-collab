#!/usr/bin/env bash
hook_input=$(cat)

require_jq() {
  PATH=${DOCTOR_PATH:-$PATH} command -v jq >/dev/null 2>&1 && return
  echo "Blocked: the hooks need jq. fix: $("$(dirname "${BASH_SOURCE[0]}")/doctor.sh" --fix jq)" >&2
  exit 2
}
require_jq

touched_files() {
  local file_path
  file_path=$(jq -r '.tool_input.file_path // ""' <<<"$hook_input")
  if [[ -n "$file_path" ]]; then
    echo "$file_path"
    return
  fi
  jq -r '.tool_input.command // ""' <<<"$hook_input" | sed -nE 's/^\*\*\* (Update|Add|Delete) File: //p; s/^\*\*\* Move to: //p'
}
