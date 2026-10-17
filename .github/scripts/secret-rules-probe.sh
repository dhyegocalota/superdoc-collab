#!/usr/bin/env bash
set -euo pipefail

gitleaks_binary="${1:?usage: secret-rules-probe.sh <gitleaks binary>}"
repository_root="$(cd "$(dirname "$0")/../.." && pwd)"
probe_directory="$(mktemp -d)"
trap 'rm -rf "$probe_directory"' EXIT

random_token="$(openssl rand -hex 18)"
printf 'token = "ghp_%s"\n' "$random_token" > "$probe_directory/near-miss.txt"
if "$gitleaks_binary" dir --no-banner --redact --exit-code 1 -c "$repository_root/.gitleaks.toml" "$probe_directory" >/dev/null 2>&1; then
  echo "secret rules: a fresh token was NOT reported" >&2
  exit 1
fi

printf 'AUTH_SECRET=compose-test-secret-with-at-least-32-characters\n' > "$probe_directory/placeholder.txt"
rm "$probe_directory/near-miss.txt"
"$gitleaks_binary" dir --no-banner --redact --exit-code 1 -c "$repository_root/.gitleaks.toml" "$probe_directory" >/dev/null 2>&1
echo "secret rules: near miss reported, shipped placeholder silent"
