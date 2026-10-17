# 0026. The agent repairs its own machine: a doctor reports at session start and never installs

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `.agents/hooks/touched-files.sh` (every hook reads its input through `jq`, and a missing `jq` turns the two blocking guards into `exit 0`), `.github/actions/install` and the `security` job of `verify.yml` (the only executable description of the environment, Ubuntu only), `docs/install.md` → "Install with an agent", [ADR 0014](0014-one-source-per-agent-surface.md), [ADR 0022](0022-mechanical-security-gates-and-a-security-reviewer.md)

## Context

The harness assumes tools that nothing in the repository names: `jq` for the four hooks, `gh` for `/open-pr` and the recorder, `ffmpeg` for the recorder, `gitleaks` for `/verify`, Docker for the README's Run it block, the Playwright Chromium for `pnpm test:e2e` and both Playwright MCP servers (`npx @playwright/mcp` does not install a browser), Node 24 and pnpm 8.15.9 from `package.json`. CI has all of them because `ubuntu-latest` ships `jq` and the workflow installs the rest, so CI never shows the gap.

On a developer's machine the gap shows in three ways. Node, pnpm, Docker, `gh`, `ffmpeg` and the browser fail loudly when first used, often at `/open-pr`, hours after the work started. `gitleaks` degrades honestly: `/verify` prints `gitleaks: not installed, CI runs it` and continues. `jq` fails silently: `touched_files()` returns nothing, `guard-secrets.sh` and `guard-git-add-all.sh` exit 0, `warn-conventions.sh` never warns and `remind-docs.sh` swallows the error. The harness looks on and is off.

Onboarding in this repository is agentic: the developer opens the repository in Claude Code or Codex and the agent does the work. The product already installs this way (`docs/install.md` → "Install with an agent"). Developing does not: there is no entry point, no detection, and the failure messages were not written for the reader who acts on them, the agent. A prose list of requirements would not change that: the agent does not read a list before accepting a task, and prose is not compiled (the repository already refuses commands in package READMEs for the same reason).

## Decision

1. **One executable list of requirements.** `.agents/hooks/doctor.sh` checks every tool the harness uses and prints one line per tool: `<tool> | required|optional | lost: <what the harness cannot do without it> | fix: <the exact command>`. It is the only list; HARNESS, README and `docs/install.md` point at it and never repeat it. It depends on bash and coreutils alone, so it runs before anything else is installed.
2. **Platform from the machine, never assumed.** The `fix:` command is chosen from `uname` and the package manager present (`brew`, `apt-get`, `dnf`, `apk`, `pacman`, in that order of detection); with none recognised the line carries the tool's official install URL. macOS is one platform among several.
3. **It runs at session start, for the agent.** `.claude/settings.json` and `.codex/hooks.json` wire the doctor as a `SessionStart` hook, so its output is in the agent's context on the first turn, before it accepts a task. `/verify` runs it as gate 0. CI runs it in `verify.yml`, so the doctor can never disagree with `actions/install`.
4. **The doctor reports; the agent repairs, with consent.** The hook installs nothing: installing from a session hook is a supply-chain surface and an irreversible action without confirmation. The agent reads the report, decides whether the current task needs the missing tool (a docs fix needs no `ffmpeg`; a PR that touches UI cannot ship without it) and asks before running the `fix:` line. Installing a tool on the machine joins **Ask first** in the autonomy contract.
5. **Blocking hooks fail closed.** `touched-files.sh` and `guard-git-add-all.sh` exit 2 with the doctor's `fix:` line for `jq` when `jq` is absent. A guard that becomes a no-op when its dependency is missing is not a guard. The error message is the instruction.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Doctor at `SessionStart`, reports only, agent repairs with consent (chosen) | the agent knows the machine before the first task; one executable list; no silent gaps; the human approves every install | one more hook; the agent spends a turn on repairs when something is missing | — |
| Doctor that installs what is missing | zero friction | a session hook that runs `brew`/`apt` on every machine that opens the repository is a supply-chain and consent problem; `sudo` prompts inside a hook hang the session | the autonomy contract already puts anything irreversible under Ask first |
| A "Set up your machine" section in prose | no code | nobody runs a list; it drifts from CI within weeks (the harness already removed commands from package READMEs for this reason); it would still have to be read by the agent, who reads the task first | prose is not compiled |
| Guards stay fail-open and the doctor merely warns | smaller change | the two blocking rules of the harness (`.env`, `git add -A`) silently stop applying on any machine without `jq` | HARNESS §12: only unambiguous rules block, and a block that evaporates is not a block |
| Devcontainer / Nix shell that provides every tool | reproducible by construction | a second environment definition beside CI; the owner and agents work on the host today; Playwright MCP and Docker inside a container add their own setup | too heavy for a take-home; the doctor can recommend it later if the tool list grows |

## Consequences

- The doctor is a single bash script with no dependencies, tested by `.agents/hooks/hooks.test.sh` with a fake `PATH` and a forced platform, so the `fix:` lines for Linux and macOS are both pinned.
- A session that starts on a machine without `jq` sees the report on turn 1 and cannot edit `.env` or run `git add -A` unnoticed in the meantime: the guards block with the same `fix:` line.
- `/verify` gains a gate 0 and CI gains one step; both fail when a required tool is missing, which on CI means `actions/install` and the doctor disagree.
- `docs/install.md` gains "Develop with an agent", three lines that mirror "Install with an agent": clone, open in Claude Code or Codex, approve the installs the first session proposes, ask for `/verify`. The README's "Read more" links it.
- `gh` is checked for presence and for `gh auth status`; the fix for the second is `gh auth login`, which only the human can complete. The doctor says so.
- Optional tools (`gitleaks`, `ffmpeg`, `docker`) never fail the gate; the line says what is lost, so the agent can judge whether the task needs it.
- If Codex has no `SessionStart` event, the doctor still runs as `$verify` gate 0; the plan verifies the event name before wiring it.

## Evidence

- `.agents/hooks/touched-files.sh` and `guard-git-add-all.sh` on 2026-10-17: `jq -r` is the only reader of the hook input; with `jq` absent, `touched_files` prints nothing and both guards reach `exit 0`.
- `grep -rn "playwright install"` across the repository on 2026-10-17: zero matches outside `node_modules`.
- `docs/install.md` → "Install with an agent": the pattern of a paste-and-run prompt that stops where only the human can continue.

## Revisit when

- The tool list grows past what one bash script keeps readable, or a tool needs a version pin the package managers cannot give; a devcontainer becomes the cheaper answer.
- Claude Code or Codex ship a native "required tools" manifest for a repository.
- A second agent tool with a different hook shape is adopted (ADR 0014 adapters).
