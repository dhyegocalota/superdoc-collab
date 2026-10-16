#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // ""')
name="${file##*/}"
if [[ "$name" =~ ^\.env ]] && [[ "$name" != *.example ]]; then
  echo "Blocked: agents never edit .env files; document the variable in .env.example instead." >&2
  exit 2
fi
exit 0
