#!/usr/bin/env bash
source "$(dirname "$0")/touched-files.sh"
warn() { echo "Convention warning in ${file##*/}: $1" >&2; }
while IFS= read -r file; do
  [[ "$file" =~ \.(ts|tsx)$ ]] || continue
  [[ -f "$file" ]] || continue
  grep -nE '\?\? ' "$file" | grep -vE '\?\? null' | head -1 | grep -q . && warn "'?? default' masks a missing value (AGENTS.md → Code conventions)."
  grep -nE "from ['\"][^'\"]+\.js['\"]" "$file" | head -1 | grep -q . && warn "'.js' extension in import."
  grep -nE '^\s*//|/\*' "$file" | grep -vE '^[0-9]+:\s*// NB ADR [0-9]{4}: ' | head -1 | grep -q . && warn "comment found; the code must explain itself (only '// NB ADR NNNN:' pointers are allowed)."
  grep -nE '\}\s*else\s*\{' "$file" | head -1 | grep -q . && warn "'else' found; return early instead."
  grep -nE '\bsleep\b|setTimeout\(resolve' "$file" | head -1 | grep -q . && warn "sleep-style wait found; wait on a condition instead."
done < <(touched_files)
exit 0
