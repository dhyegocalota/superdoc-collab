#!/usr/bin/env bash
set -u
here="$(cd "$(dirname "$0")" && pwd)"
source_root="$(cd "$here/.." && pwd)"
failures=0

scratch=$(mktemp -d)
repository="$scratch/repository"
stub_bin="$scratch/stub-bin"
linked_bin="$scratch/linked-bin"
export STUB_LOG="$scratch/calls.log"
export STUB_MUTATE= STUB_REPOSITORY="$repository"
stub_path="$repository/node_modules/.bin:$stub_bin:$linked_bin:/usr/bin:/bin"

DEFAULT_NODE_VERSION=v24.7.0
OTHER_NODE_VERSION=v25.0.0
ALL_GATES="doctor format secrets typecheck audit unit e2e docker"
DOCS_GATES="doctor format secrets audit shape"
ALL_PACKAGES="@superdoc-collab/history @superdoc-collab/server @superdoc-collab/types @superdoc-collab/web"

expect_match() {
  local name=$1 output=$2 pattern=$3
  [[ "$output" =~ $pattern ]] && return
  echo "FAIL $name: output did not match /$pattern/: $output"
  failures=$((failures + 1))
}

expect_no_match() {
  local name=$1 output=$2 pattern=$3
  [[ "$output" =~ $pattern ]] || return
  echo "FAIL $name: output matched /$pattern/: $output"
  failures=$((failures + 1))
}

expect_equal() {
  local name=$1 actual=$2 expected=$3
  [[ "$actual" == "$expected" ]] && return
  echo "FAIL $name: expected '$expected', got '$actual'"
  failures=$((failures + 1))
}

expect_line() {
  local name=$1 output=$2 key=$3 expected=$4
  expect_equal "$name: $key" "$(grep "^$key: " <<< "$output")" "$key: $expected"
}

in_repository() { git -C "$repository" -c user.name=verify -c user.email=verify@example.com "$@"; }

write_stub() {
  printf '#!/usr/bin/env bash\n%s\n' "$2" > "$stub_bin/$1"
  chmod +x "$stub_bin/$1"
}

install_stubs() {
  mkdir -p "$stub_bin" "$linked_bin"
  write_stub pnpm 'echo "pnpm $* TZ=${TZ:-}" >> "$STUB_LOG"; [[ -n "${STUB_MUTATE:-}" ]] && eval "$STUB_MUTATE"; [[ "$*" == "${STUB_FAIL:-}" ]] && exit 1; exit 0'
  write_stub node 'echo "$STUB_NODE_VERSION"'
  write_stub gitleaks 'echo "gitleaks $*" >> "$STUB_LOG"'
  write_stub docker 'echo "docker $*" >> "$STUB_LOG"; [[ "$1" == info && -n "${STUB_DOCKER_DOWN:-}" ]] && exit 1; exit 0'
  ln -sf "$(command -v git)" "$linked_bin/git"
  ln -sf "$(command -v jq)" "$linked_bin/jq"
}

write_package() {
  local folder=$1 name=$2 dependencies=$3
  mkdir -p "$repository/$folder"
  printf '{"name":"%s","dependencies":%s}\n' "$name" "$dependencies" > "$repository/$folder/package.json"
}

change() {
  mkdir -p "$(dirname "$repository/$1")"
  printf 'change %s\n' "$RANDOM" >> "$repository/$1"
}

commit_change() {
  change "$1"
  in_repository add -- "$1"
  in_repository commit -q -m "change $1"
}

head_sha() { in_repository rev-parse HEAD; }
record_file() { echo "$repository/.git/verify/$(head_sha)"; }
record_count() { find "$repository/.git/verify" -type f 2>/dev/null | wc -l | tr -d ' '; }

new_repository() {
  rm -rf "$repository" "$stub_bin" "$scratch/origin.git"
  install_stubs
  mkdir -p "$repository"
  in_repository init -q -b main
  echo node_modules >> "$repository/.git/info/exclude"
  mkdir -p "$repository/scripts" "$repository/.agents/hooks" "$repository/.agents/skills/x" "$repository/.github/scripts" "$repository/.github/workflows" "$repository/docker" "$repository/docs"
  cp "$source_root/scripts/verify.sh" "$source_root/scripts/verify-gates.tsv" "$repository/scripts/"
  write_package apps/web @superdoc-collab/web '{"@superdoc-collab/history":"workspace:*","@superdoc-collab/types":"workspace:*"}'
  write_package apps/server @superdoc-collab/server '{"@superdoc-collab/history":"workspace:*","@superdoc-collab/types":"workspace:*"}'
  write_package libs/history @superdoc-collab/history '{"@superdoc-collab/types":"workspace:*"}'
  write_package libs/types @superdoc-collab/types '{}'
  write_package tools/repository-shape @superdoc-collab/repository-shape '{}'
  printf '#!/usr/bin/env bash\n[[ "${1:-}" == --fix ]] && { echo "install $2"; exit 0; }\necho doctor >> "$STUB_LOG"\n' > "$repository/.agents/hooks/doctor.sh"
  printf '#!/usr/bin/env bash\necho "probe $*" >> "$STUB_LOG"\n' > "$repository/.github/scripts/secret-rules-probe.sh"
  chmod +x "$repository/.agents/hooks/doctor.sh" "$repository/.github/scripts/secret-rules-probe.sh" "$repository/scripts/verify.sh"
  local tracked
  for tracked in README.md LICENSE AGENTS.md pnpm-lock.yaml docs/install.md docker/Dockerfile .agents/skills/x/SKILL.md .github/workflows/verify.yml apps/web/README.md apps/web/vite.config.ts apps/web/src/a.ts apps/server/src/x.ts tools/repository-shape/src/x.test.ts libs/types/src/x.ts; do
    change "$tracked"
  done
  in_repository add -- scripts apps libs tools .agents .github docker docs README.md LICENSE AGENTS.md pnpm-lock.yaml
  in_repository commit -q -m initial
  git init -q --bare "$scratch/origin.git"
  in_repository remote add origin "$scratch/origin.git"
  in_repository push -q origin main
  in_repository checkout -q -b feature
  export STUB_NODE_VERSION=$DEFAULT_NODE_VERSION STUB_FAIL= STUB_DOCKER_DOWN= STUB_MUTATE=
  : > "$STUB_LOG"
}

run_verify() {
  output=$(cd "$repository" && PATH="$stub_path" bash scripts/verify.sh "$@" 2>&1)
  status=$?
}

classify() {
  new_repository
  change "$1"
  run_verify --plan
}

calls() { cat "$STUB_LOG"; }

classify README.md
expect_line "a README typo" "$output" class docs
expect_line "a README typo" "$output" gates "$DOCS_GATES"
expect_line "a README typo" "$output" packages -

classify docs/install.md
expect_line "docs/install.md" "$output" class tooling

classify docs/agent-install.md
expect_line "docs/agent-install.md" "$output" class tooling

classify docs/scenarios/x.md
expect_line "a scenario" "$output" class tooling

classify docs/adr/0001-x.md
expect_line "an ADR" "$output" class docs

classify apps/web/README.md
expect_line "a package README" "$output" class docs

classify apps/web/vite.config.ts
expect_line "a web file" "$output" class product
expect_line "a web file" "$output" gates "doctor format secrets typecheck audit shape unit e2e"
expect_line "a web file" "$output" packages @superdoc-collab/web

classify apps/server/src/x.ts
expect_line "a server file" "$output" packages @superdoc-collab/server
expect_line "a server file" "$output" gates "doctor format secrets typecheck audit shape unit e2e"

classify libs/types/src/x.ts
expect_line "a types file" "$output" packages "$ALL_PACKAGES"

classify .agents/skills/x/SKILL.md
expect_line "a skill" "$output" class tooling
expect_line "a skill" "$output" gates "doctor format secrets audit hooks shape"

classify AGENTS.md
expect_line "AGENTS.md" "$output" class tooling

classify .github/workflows/verify.yml
expect_line "a workflow" "$output" class tooling
expect_no_match "a workflow" "$(printf '%s\n' "$output" | grep '^gates:')" 'e2e'

classify tools/repository-shape/src/x.test.ts
expect_line "a repository shape test" "$output" gates "doctor format secrets typecheck audit shape"
expect_no_match "a repository shape test" "$(printf '%s\n' "$output" | grep '^gates:')" 'e2e'

classify tools/repository-shape/package.json
expect_line "a tools manifest" "$output" gates "$ALL_GATES"

classify pnpm-lock.yaml
expect_line "the lockfile" "$output" class product
expect_line "the lockfile" "$output" gates "$ALL_GATES"

classify scripts/verify-gates.tsv
expect_line "the gate map" "$output" gates "$ALL_GATES"

classify LICENSE
expect_line "an unknown path" "$output" class product
expect_line "an unknown path" "$output" gates "$ALL_GATES"

new_repository
in_repository mv apps/web/src/a.ts docs/a.md
run_verify --plan
expect_line "a rename out of an app" "$output" class product
expect_line "a rename out of an app" "$output" packages @superdoc-collab/web

classify apps/server/src/new.ts
expect_line "an untracked server file" "$output" packages @superdoc-collab/server

new_repository
change README.md
change apps/web/vite.config.ts
run_verify --plan
expect_line "a README and a web file" "$output" class product

classify docker/Dockerfile
expect_line "the Dockerfile" "$output" gates "doctor format secrets audit shape docker"

new_repository
commit_change README.md
run_verify
expect_equal "a README change runs green" "$status" 0
expect_match "a README change reports the gates" "$output" "verify: 5 gates green at $(in_repository rev-parse --short HEAD) \(docs\)"
expect_no_match "a README change skips the heavy gates" "$(calls)" 'typecheck|test:unit|test:e2e'

new_repository
commit_change docker/Dockerfile
STUB_DOCKER_DOWN=1
run_verify
expect_equal "Docker down fails" "$status" 1
expect_match "Docker down names the fix" "$output" 'verify: docker failed: the image needs a running Docker\. fix: install docker'

new_repository
commit_change pnpm-lock.yaml
STUB_DOCKER_DOWN=1
run_verify
expect_equal "the lockfile without Docker exits 0" "$status" 0
expect_match "the lockfile without Docker skips the image" "$output" 'verify: docker skipped: Docker is not running; the image is proven only when its own files change \(docker/, \.dockerignore, railway\.json, compose files\)'
expect_equal "the lockfile without Docker writes a record" "$(record_count)" 1

new_repository
commit_change README.md
STUB_DOCKER_DOWN=1
run_verify all
expect_equal "all without Docker exits 0" "$status" 0
expect_match "all without Docker skips the image" "$output" 'verify: docker skipped: Docker is not running'

new_repository
commit_change apps/web/vite.config.ts
STUB_FAIL=typecheck
run_verify
expect_equal "a failing typecheck exits 1" "$status" 1
expect_match "a failing typecheck is named" "$output" 'verify: typecheck failed'
expect_no_match "a failing typecheck stops the run" "$(calls)" 'security:audit|test:unit|test:e2e'
expect_equal "a failing typecheck writes no record" "$(record_count)" 0

new_repository
commit_change README.md
rm "$stub_bin/gitleaks"
run_verify
expect_equal "a missing gitleaks exits 1" "$status" 1
expect_match "a missing gitleaks names the fix" "$output" 'verify: secrets failed: gitleaks is not installed\. fix: install gitleaks'

new_repository
commit_change README.md
run_verify
expect_equal "a clean green run exits 0" "$status" 0
expect_match "a clean green run writes the record" "$(cat "$(record_file)")" "node: $DEFAULT_NODE_VERSION"$'\n'"class: docs"$'\n'"gates: $DOCS_GATES"
: > "$STUB_LOG"
run_verify
expect_equal "a second run exits 0" "$status" 0
expect_match "a second run is already green" "$output" "verify: $(in_repository rev-parse --short HEAD) already green"
expect_match "a second run still scans and audits" "$(calls)" 'gitleaks git.*pnpm security:audit|pnpm security:audit.*gitleaks git'
expect_no_match "a second run runs nothing else" "$(calls)" 'typecheck|test:unit|test:e2e|prettier|doctor'

new_repository
change README.md
run_verify
expect_equal "a dirty green run exits 0" "$status" 0
expect_equal "a dirty green run writes no record" "$(record_count)" 0

new_repository
commit_change apps/web/vite.config.ts
recorded_commit=$(head_sha)
run_verify
commit_change README.md
run_verify --plan
expect_line "a docs commit after a recorded commit" "$output" base "$recorded_commit (record)"
expect_line "a docs commit after a recorded commit" "$output" class product
expect_line "a docs commit after a recorded commit" "$output" gates "$DOCS_GATES"

new_repository
commit_change README.md
run_verify
STUB_NODE_VERSION=$OTHER_NODE_VERSION
run_verify --plan
expect_line "a record under another Node version" "$output" base "$(in_repository rev-parse origin/main) (merge base)"

new_repository
commit_change apps/web/vite.config.ts
run_verify
in_repository checkout -q main
commit_change apps/server/src/x.ts
in_repository push -q origin main
in_repository checkout -q feature
in_repository merge -q --no-edit main
run_verify --plan
expect_line "a merge of main into a recorded branch" "$output" packages @superdoc-collab/server

new_repository
commit_change apps/web/vite.config.ts
run_verify
run_verify all --plan
expect_line "all ignores records" "$output" base "$(in_repository rev-parse origin/main) (merge base)"
: > "$STUB_LOG"
run_verify all
expect_equal "all exits 0" "$status" 0
expect_match "all checks the whole format" "$(calls)" 'pnpm format:check'
expect_match "all runs every unit suite" "$(calls)" 'pnpm test:unit'
expect_match "all runs every E2E suite" "$(calls)" 'pnpm test:e2e'

classify docs/install.sh
expect_line "an unknown file under docs" "$output" gates "$ALL_GATES"

classify docs/media/x.png
expect_line "a screenshot" "$output" class docs

classify .dockerignore
expect_line "the dockerignore" "$output" gates "doctor format secrets audit shape docker"

new_repository
commit_change .dockerignore
STUB_DOCKER_DOWN=1
run_verify
expect_equal "the dockerignore without Docker exits 1" "$status" 1
expect_match "the dockerignore without Docker fails the gate" "$output" 'verify: docker failed'

new_repository
commit_change apps/web/vite.config.ts
run_verify
run_verify --plan
expect_line "the class after a recorded run" "$output" class product
expect_line "the gates after a recorded run" "$output" gates "secrets audit"

new_repository
commit_change apps/web/vite.config.ts
in_repository branch -f main HEAD
run_verify --plan
expect_line "a moved local main" "$output" class product
expect_line "a moved local main" "$output" gates "doctor format secrets typecheck audit shape unit e2e"

new_repository
in_repository remote set-url origin "$scratch/missing.git"
run_verify --plan
expect_match "a failed fetch is said" "$output" 'verify: could not fetch origin main; the base is origin/main as last fetched'
expect_line "a failed fetch still plans" "$output" class docs

new_repository
change README.md
STUB_MUTATE='git -C "$STUB_REPOSITORY" checkout -q -- .'
run_verify
expect_equal "a tree dirty at the start exits 0" "$status" 0
expect_equal "a tree dirty at the start writes no record" "$(record_count)" 0

new_repository
commit_change README.md
STUB_MUTATE='git -C "$STUB_REPOSITORY" -c user.name=verify -c user.email=verify@example.com commit -q --allow-empty -m moved'
run_verify
expect_equal "a HEAD that moved exits 0" "$status" 0
expect_equal "a HEAD that moved writes no record" "$(record_count)" 0

new_repository
commit_change README.md
STUB_MUTATE='echo late >> "$STUB_REPOSITORY/README.md"'
run_verify
expect_equal "a tree dirty at the end exits 0" "$status" 0
expect_equal "a tree dirty at the end writes no record" "$(record_count)" 0

new_repository
commit_change "apps/web/src/my file.ts"
run_verify
expect_equal "a path with a space exits 0" "$status" 0
expect_match "a path with a space reaches Prettier whole" "$(calls)" 'prettier --check --ignore-unknown apps/web/src/my file\.ts'

new_repository
commit_change README.md
mkdir -p "$repository/node_modules/.bin"
printf '#!/usr/bin/env bash\necho "planted gitleaks" >> "$STUB_LOG"\n' > "$repository/node_modules/.bin/gitleaks"
chmod +x "$repository/node_modules/.bin/gitleaks"
run_verify
expect_equal "a planted gitleaks exits 0" "$status" 0
expect_no_match "a planted gitleaks is never run" "$(calls)" 'planted'
expect_match "the real gitleaks is run" "$(calls)" 'gitleaks git'

new_repository
commit_change README.md
mkdir -p "$repository/node_modules/.bin"
cp "$stub_bin/gitleaks" "$repository/node_modules/.bin/gitleaks"
rm "$stub_bin/gitleaks"
run_verify
expect_equal "only a planted gitleaks exits 1" "$status" 1
expect_match "only a planted gitleaks counts as missing" "$output" 'verify: secrets failed: gitleaks is not installed'

new_repository
commit_change apps/web/vite.config.ts
in_repository config remote.origin.fetch '+refs/heads/none:refs/remotes/origin/none'
in_repository update-ref refs/remotes/origin/main HEAD
run_verify --plan
expect_line "a forged tracking ref" "$output" class product
expect_line "a forged tracking ref" "$output" gates "doctor format secrets typecheck audit shape unit e2e"

new_repository
commit_change README.md
in_repository remote set-url origin "$scratch/missing.git"
run_verify
expect_equal "a failed fetch still runs green" "$status" 0
expect_match "a failed fetch says no record" "$output" 'verify: no record: origin main could not be fetched'
expect_equal "a failed fetch writes no record" "$(record_count)" 0

new_repository
commit_change apps/server/src/x.ts
run_verify
expect_equal "a server change exits 0" "$status" 0
expect_match "a server change runs the server again in Kolkata" "$(calls)" 'pnpm --filter @superdoc-collab/server test:unit TZ=Asia/Kolkata'
expect_match "a server change announces the time zone run" "$output" 'verify: unit in Asia/Kolkata'

new_repository
commit_change apps/web/vite.config.ts
run_verify
expect_equal "a web change exits 0" "$status" 0
expect_match "a web change runs the web unit suite" "$(calls)" 'pnpm --filter @superdoc-collab/web test:unit'
expect_no_match "a web change never runs in Kolkata" "$(calls)" 'TZ=Asia/Kolkata'

new_repository
commit_change README.md
run_verify all
expect_equal "all exits 0" "$status" 0
expect_match "all runs the libraries and the server again in Kolkata" "$(calls)" 'pnpm --filter @superdoc-collab/server --filter @superdoc-collab/history --filter @superdoc-collab/types test:unit TZ=Asia/Kolkata'

rm -rf "$scratch"

[[ "$failures" == 0 ]] && echo "verify: all checks passed" && exit 0
echo "verify: $failures check(s) failed"
exit 1
