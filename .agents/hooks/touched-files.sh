#!/usr/bin/env bash
hook_input=$(cat)

touched_files() {
  local file_path
  file_path=$(jq -r '.tool_input.file_path // ""' <<<"$hook_input")
  if [[ -n "$file_path" ]]; then
    echo "$file_path"
    return
  fi
  jq -r '.tool_input.command // ""' <<<"$hook_input" | sed -nE 's/^\*\*\* (Update|Add|Delete) File: //p; s/^\*\*\* Move to: //p'
}
