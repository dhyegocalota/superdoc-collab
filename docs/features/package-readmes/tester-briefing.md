# Tester briefing: Package READMEs and docs that move with the code

## What changed

- `.agents/hooks/remind-docs.sh`: a Stop hook. It reads uncommitted changes (`git status --porcelain -uall`), maps each changed file to its nearest `README.md` (root when none) and to every `.claude/rules/*.md` whose `paths:` globs match it, drops documents that are themselves changed, and prints `{"decision":"block","reason":…}` naming the rest. It stays silent outside a git repository, on a clean tree, when `stop_hook_active` is true, and when the set equals the one stored in `$(git rev-parse --git-dir)/docs-reminder`.
- Wired as `Stop` in `.claude/settings.json` and `.codex/hooks.json`.
- `apps/server/src/repository-shape/delivery-docs.test.ts`: link-checks every tracked or untracked-but-not-ignored `README.md` (was: root README and two runbooks), skips links in inline code and fenced blocks, and requires a README in each `apps/*` and `libs/*` folder.
- READMEs: `apps/web`, `apps/server`, `libs/history`, `libs/types`, `e2e`. `docs/adr/README.md`: the superseded link now points at ADR 0019.
- Process: HARNESS (layout, Build, Ship gate 5, Enforcement), `AGENTS.md`, the reviewer role, the `open-pr` skill, the root README's Tests row.

## How to run

- `pnpm test:hooks`
- `pnpm --filter @superdoc-history/server exec vitest run src/repository-shape/delivery-docs.test.ts`

## Red before, green after

- The commit `test(hooks): …` holds the hook checks without the script: 7 failures, "No such file or directory".
- The commit `test(server): …` holds the README checks without the READMEs: `docs/adr/README.md` reports `0018-deploy-on-railway.md`; the package check lists the four packages.

## Hypotheses to attack

- The hook never blocks twice in one turn and never loops.
- The hook works with the input shapes both Claude Code and Codex send.
- Every fact in the five READMEs is true today.
- A renamed folder named in a README fails CI.
