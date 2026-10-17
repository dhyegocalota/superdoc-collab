#!/usr/bin/env bash
set -u
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
platform=${DOCTOR_UNAME:-$(uname -s)}
lookup_path=${DOCTOR_PATH:-$PATH}
home=${DOCTOR_HOME:-$HOME}
skipped=" ${DOCTOR_SKIP:-} "
wanted_node=$(tr -d '[:space:]' < "$root/.nvmrc")
wanted_pnpm=$(sed -nE 's/.*"packageManager": *"pnpm@([^"]+)".*/\1/p' "$root/package.json")

have() { PATH=$lookup_path command -v "$1" >/dev/null 2>&1; }
run() { PATH=$lookup_path "$@"; }

package_manager() {
  local candidate
  for candidate in brew apt-get dnf apk pacman; do
    have "$candidate" && { echo "$candidate"; return; }
  done
  echo none
}
manager=$(package_manager)

install_with() {
  case "$manager" in
    brew) echo "brew install $1" ;;
    apt-get) echo "sudo apt-get install -y $1" ;;
    dnf) echo "sudo dnf install -y $1" ;;
    apk) echo "sudo apk add $1" ;;
    pacman) echo "sudo pacman -S --noconfirm $1" ;;
    *) echo "$2" ;;
  esac
}

chromium_install() {
  [[ "$platform" == Linux ]] && { echo "pnpm install && pnpm exec playwright install --with-deps chromium"; return; }
  echo "pnpm install && pnpm exec playwright install chromium"
}

docker_install() {
  [[ "$manager" == brew ]] && { echo "brew install --cask docker"; return; }
  echo "https://docs.docker.com/engine/install/"
}

fix_for() {
  case "$1" in
    node) echo "nvm install (reads .nvmrc), or https://nodejs.org/en/download" ;;
    pnpm) echo "corepack enable && corepack prepare pnpm@$wanted_pnpm --activate" ;;
    jq) install_with jq "https://jqlang.github.io/jq/download/" ;;
    gh) install_with gh "https://github.com/cli/cli#installation" ;;
    gh-auth) echo "gh auth login (run it yourself; the agent cannot)" ;;
    chromium) chromium_install ;;
    skills) echo "ln -sfn ../.agents/skills .claude/skills" ;;
    gitleaks) install_with gitleaks "https://github.com/gitleaks/gitleaks#installing" ;;
    ffmpeg) install_with ffmpeg "https://ffmpeg.org/download.html" ;;
    docker) docker_install ;;
  esac
}

lost_for() {
  case "$1" in
    node|pnpm) echo "everything" ;;
    jq) echo "the four hooks; the two guards block" ;;
    gh) echo "/open-pr and the recorder's release upload" ;;
    chromium) echo "pnpm test:e2e, both Playwright MCP servers, /check-ui, /scenario, the tester" ;;
    skills) echo "every Claude Code skill (ADR 0014)" ;;
    gitleaks) echo "the local secret scan; CI runs it" ;;
    ffmpeg) echo "the recorder's mp4 and gif; a PR that touches UI cannot ship" ;;
    docker) echo "README → Run it and booting the image locally; every gate runs from source" ;;
  esac
}

browsers_dir() {
  [[ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ]] && { echo "$PLAYWRIGHT_BROWSERS_PATH"; return; }
  [[ "$platform" == Darwin ]] && { echo "$home/Library/Caches/ms-playwright"; return; }
  echo "$home/.cache/ms-playwright"
}

node_major() { run node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

check_node() { have node && [[ "$(node_major)" -ge "$wanted_node" ]]; }
check_pnpm() { have pnpm && [[ "$(run pnpm -v 2>/dev/null)" == "$wanted_pnpm" ]]; }
check_jq() { have jq; }
check_gh() { have gh && run gh auth status >/dev/null 2>&1; }
check_chromium() { ls -d "$(browsers_dir)"/chromium-* >/dev/null 2>&1; }
check_skills() { [[ "$(cd "$root/.claude/skills" 2>/dev/null && pwd -P)" == "$(cd "$root/.agents/skills" && pwd -P)" ]]; }
check_gitleaks() { have gitleaks; }
check_ffmpeg() { have ffmpeg; }
check_docker() { have docker && run docker info >/dev/null 2>&1; }

fix_name_for() {
  [[ "$1" == gh ]] && have gh && { echo gh-auth; return; }
  echo "$1"
}

if [[ "${1:-}" == --fix ]]; then
  fix_for "$(fix_name_for "$2")"
  exit 0
fi

missing_required=0
missing_optional=0

report() {
  local tool=$1 requirement=$2 state
  state=missing
  [[ "$skipped" == *" $tool "* ]] && state=skipped
  [[ "$state" == missing ]] && "check_$tool" && state=ok
  printf '%s | %s | %s | lost: %s | fix: %s\n' "$tool" "$state" "$requirement" "$(lost_for "$tool")" "$(fix_for "$(fix_name_for "$tool")")"
  [[ "$state" == missing ]] || return 0
  [[ "$requirement" == required ]] && missing_required=$((missing_required + 1)) && return 0
  missing_optional=$((missing_optional + 1))
}

report node required
report pnpm required
report jq required
report gh required
report chromium required
report skills required
report gitleaks optional
report ffmpeg optional
report docker optional
echo "doctor: $missing_required missing required, $missing_optional missing optional"
[[ "$missing_required" == 0 ]]
