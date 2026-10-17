#!/usr/bin/env bash
set -u
readonly GATES_MAP=scripts/verify-gates.tsv
readonly RECORDS_DIRECTORY_NAME=verify
readonly MAIN_REF=main
readonly ALL_GATES="doctor format secrets typecheck audit hooks shape unit e2e docker"
readonly ALWAYS_GATES="doctor format secrets shape"
readonly EVERYTHING_GATES=all
readonly NO_GATES=-
readonly SERVER_PACKAGE=@superdoc-collab/server
readonly IMAGE_TAG=superdoc-collab:verify
readonly DOCKER_SKIPPED="verify: docker skipped: Docker is not running; the image is proven only when docker/ or deploy/ change"
readonly USAGE="usage: verify.sh [auto|all] [--plan]"

mode=auto
only_plan=false
for argument in "$@"; do
  [[ "$argument" == --plan ]] && { only_plan=true; continue; }
  [[ "$argument" == auto || "$argument" == all ]] && { mode=$argument; continue; }
  echo "$USAGE" >&2
  exit 2
done

root=$(git rev-parse --show-toplevel) || exit 1
cd "$root" || exit 1
records_directory="$(git rev-parse --path-format=absolute --git-common-dir)/$RECORDS_DIRECTORY_NAME"
node_version=$(node --version)
head_sha=$(git rev-parse HEAD)
short_sha=$(git rev-parse --short HEAD)
failure_reason=""

have() { command -v "$1" >/dev/null 2>&1; }
has_word() { [[ " $1 " == *" $2 "* ]]; }
is_tree_clean() { [[ -z "$(git status --porcelain)" ]]; }

has_record() {
  local record_file="$records_directory/$1"
  [[ -f "$record_file" ]] && grep -qxF "node: $node_version" "$record_file"
}

recorded_commit() {
  local commit
  while read -r commit; do
    has_record "$commit" && { echo "$commit"; return; }
  done < <(git rev-list -n 1 HEAD; git rev-list "$merge_base..HEAD")
}

class_rank() {
  case "$1" in
    docs) echo 0 ;;
    tooling) echo 1 ;;
    product) echo 2 ;;
  esac
}

row_for() {
  local path=$1 glob row_class row_gates
  while IFS=$'\t' read -r glob row_class row_gates; do
    [[ $path == $glob ]] && { printf '%s\t%s\n' "$row_class" "$row_gates"; return; }
  done < "$root/$GATES_MAP"
  printf 'product\t%s\n' "$EVERYTHING_GATES"
}

depends_on() {
  jq -e --arg name "$2" '(.dependencies + .devDependencies)[$name] | strings | startswith("workspace:")' "$1" >/dev/null 2>&1
}

absorb_path() {
  local path=$1 row_class row_gates
  IFS=$'\t' read -r row_class row_gates <<< "$(row_for "$path")"
  [[ $(class_rank "$row_class") -gt $(class_rank "$class") ]] && class=$row_class
  [[ $row_gates == "$EVERYTHING_GATES" ]] && run_everything=true
  has_word "$row_gates" docker && image_changed=true
  has_word "$row_gates" unit && unit_folders="$unit_folders $(cut -d/ -f1-2 <<< "$path")"
  [[ $row_gates == "$EVERYTHING_GATES" || $row_gates == "$NO_GATES" ]] || wanted_gates="$wanted_gates $row_gates"
}

add_dependents() {
  local manifest candidate dependency grew=true
  while [[ $grew == true ]]; do
    grew=false
    for manifest in $manifests; do
      candidate=$(jq -r .name "$manifest")
      has_word "$unit_packages" "$candidate" && continue
      for dependency in $unit_packages; do
        depends_on "$manifest" "$dependency" || continue
        unit_packages="$unit_packages $candidate"
        grew=true
        break
      done
    done
  done
}

sorted_words() { printf '%s\n' $1 | sort -u | paste -sd' ' -; }

selected_gates() {
  local gate selected=""
  for gate in $ALL_GATES; do
    has_word "$wanted_gates" "$gate" || continue
    [[ $gate == shape ]] && has_word "$unit_packages" "$SERVER_PACKAGE" && continue
    selected="${selected:+$selected }$gate"
  done
  echo "$selected"
}

run_gate() {
  local gate=$1 started=$SECONDS
  failure_reason=""
  "gate_$gate" && { echo "verify: $gate ok in $((SECONDS - started))s"; return; }
  echo "verify: $gate failed${failure_reason:+: $failure_reason}"
  exit 1
}

gate_doctor() { "$root/.agents/hooks/doctor.sh"; }

gate_format() {
  [[ $mode == all ]] && { pnpm format:check; return; }
  local existing_files=() path
  for path in $changed_paths; do
    [[ -f $path ]] && existing_files+=("$path")
  done
  [[ ${#existing_files[@]} -gt 0 ]] && { pnpm exec prettier --check --ignore-unknown "${existing_files[@]}"; return; }
  echo "verify: format has no changed file to check"
}

gate_secrets() {
  have gitleaks || { failure_reason="gitleaks is not installed. fix: $("$root/.agents/hooks/doctor.sh" --fix gitleaks)"; return 1; }
  "$root/.github/scripts/secret-rules-probe.sh" "$(command -v gitleaks)" && gitleaks git --no-banner --redact --exit-code 1 "$root"
}

gate_typecheck() { pnpm typecheck; }
gate_audit() { pnpm security:audit; }
gate_hooks() { pnpm test:hooks; }
gate_shape() { pnpm --filter "$SERVER_PACKAGE" exec vitest run src/repository-shape; }
gate_e2e() { pnpm test:e2e; }

gate_unit() {
  [[ $run_everything == true ]] && { pnpm test:unit; return; }
  pnpm $(printf -- '--filter %s ' $unit_packages) test:unit
}

docker_is_running() { have docker && docker info >/dev/null 2>&1; }

gate_docker() {
  docker_is_running && { docker build -f "$root/docker/Dockerfile" -t "$IMAGE_TAG" "$root"; return; }
  [[ $image_changed == false ]] && { echo "$DOCKER_SKIPPED"; return; }
  failure_reason="the image needs a running Docker. fix: $("$root/.agents/hooks/doctor.sh" --fix docker)"
  return 1
}

write_record() {
  mkdir -p "$records_directory"
  local temporary_file
  temporary_file=$(mktemp "$records_directory/.pending.XXXXXX")
  printf 'node: %s\nclass: %s\ngates: %s\n' "$node_version" "$class" "$gates" > "$temporary_file"
  mv "$temporary_file" "$records_directory/$head_sha"
}

merge_base=$(git merge-base HEAD "$MAIN_REF") || exit 1
base=$merge_base
base_source="merge base"
recorded_base=""
[[ $mode == auto ]] && recorded_base=$(recorded_commit)
[[ -n $recorded_base ]] && { base=$recorded_base; base_source=record; }

changed_paths=$({ git diff --name-only --no-renames "$base"; git ls-files --others --exclude-standard; } | sort -u)
manifests=$(ls apps/*/package.json libs/*/package.json)

class=docs
wanted_gates=$ALWAYS_GATES
unit_folders=""
unit_packages=""
run_everything=false
image_changed=false
[[ $mode == all ]] && run_everything=true

while IFS= read -r path; do
  [[ -n $path ]] && absorb_path "$path"
done <<< "$changed_paths"

if [[ $run_everything == true ]]; then
  wanted_gates=$ALL_GATES
  unit_packages=$(jq -r .name $manifests)
fi

for folder in $unit_folders; do
  unit_packages="$unit_packages $(jq -r .name "$folder/package.json")"
done
add_dependents
unit_packages=$(sorted_words "$unit_packages")
gates=$(selected_gates)

is_already_green=false
[[ $mode == auto ]] && has_record "$head_sha" && is_tree_clean && is_already_green=true

if [[ $only_plan == true ]]; then
  shown_gates=$gates
  [[ $is_already_green == true ]] && shown_gates=$NO_GATES
  echo "base: $base ($base_source)"
  echo "class: $class"
  echo "gates: $shown_gates"
  echo "packages: ${unit_packages:-$NO_GATES}"
  exit 0
fi

[[ $is_already_green == true ]] && { echo "verify: $short_sha already green"; exit 0; }

gate_count=0
for gate in $gates; do
  run_gate "$gate"
  gate_count=$((gate_count + 1))
done

is_tree_clean && write_record
echo "verify: $gate_count gates green at $short_sha ($class)"
