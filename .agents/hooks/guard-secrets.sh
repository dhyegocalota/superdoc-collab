#!/usr/bin/env bash
source "$(dirname "$0")/touched-files.sh"
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  name="${file##*/}"
  [[ "$name" =~ ^\.env ]] || continue
  [[ "$name" == *.example ]] && continue
  echo "Blocked: agents never edit .env files; document the variable in .env.example instead." >&2
  exit 2
done < <(touched_files)
exit 0
