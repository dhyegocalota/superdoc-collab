#!/usr/bin/env bash
command=$(jq -r '.tool_input.command // ""')
if [[ "$command" =~ git[[:space:]]+add[[:space:]]+(-A|--all|\.)([[:space:]]|$) ]]; then
  echo "Blocked: stage files by name, never git add -A / --all / ." >&2
  exit 2
fi
if [[ "$command" =~ --no-verify ]]; then
  echo "Blocked: --no-verify skips the gates this repo depends on." >&2
  exit 2
fi
exit 0
