#!/usr/bin/env bash
set -euo pipefail

gitleaks_binary="${1:?usage: secret-rules-probe.sh <gitleaks binary>}"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
probe_directory="$(mktemp -d)"
github_lookalike_suffix="zuuqcRO1Je0lCr4ktYmgNBLoGoPVGhPIaT35"
placeholder_lookalike_suffix="0hzOkrDZV4A8rpRu7Dl4AYIdZdf9JlKY"
trap 'rm -rf "$probe_directory"' EXIT

scan() {
  "$gitleaks_binary" dir --no-banner --redact --exit-code 1 -c "$repository_root/.gitleaks.toml" "$probe_directory" >/dev/null 2>&1
}

printf 'token = "ghp_%s"\n' "$github_lookalike_suffix" > "$probe_directory/near-miss.txt"
if scan; then
  echo "secret rules: a fresh token was NOT reported" >&2
  exit 1
fi

printf 'AUTH_SECRET=compose-test-secret-%s\n' "$placeholder_lookalike_suffix" > "$probe_directory/near-miss.txt"
if scan; then
  echo "secret rules: a random secret borrowing a placeholder prefix was NOT reported; the allowlist must hold exact strings only" >&2
  exit 1
fi

rm "$probe_directory/near-miss.txt"
printf 'AUTH_SECRET=compose-test-secret-with-at-least-32-characters\n' > "$probe_directory/placeholder.txt"
if ! scan; then
  echo "secret rules: a shipped placeholder was reported, or gitleaks failed" >&2
  exit 1
fi
echo "secret rules: near misses reported, shipped placeholder silent"
