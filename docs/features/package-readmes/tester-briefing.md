# Tester briefing: Package READMEs and docs that move with the code

## What changed

- `.agents/hooks/remind-docs.sh`: a Stop hook. It reads uncommitted changes (`git status --porcelain -uall`), maps each changed file to its nearest `README.md` (root when none) and to every `.claude/rules/*.md` whose `paths:` globs match it, drops documents that are themselves changed, and prints `{"decision":"block","reason":…}` naming the rest. It stays silent outside a git repository, on a clean tree, when `stop_hook_active` is true, and when the set equals the one stored in `$(git rev-parse --git-dir)/docs-reminder`.
- Wired as `Stop` in `.claude/settings.json` and `.codex/hooks.json`.
- `apps/server/src/repository-shape/delivery-docs.test.ts`: link-checks every tracked or untracked-but-not-ignored `README.md` (was: root README and two runbooks), skips links in inline code and fenced blocks, and requires a README in each `apps/*` and `libs/*` folder.
- READMEs: `apps/web`, `apps/server`, `libs/history`, `libs/types`, `e2e`. `docs/adr/README.md`: the superseded link now points at ADR 0019.
- Process: HARNESS (layout, Build, Ship gate 5, Enforcement), `AGENTS.md`, the reviewer role, the `open-pr` skill, the root README's Tests row.

## How to run

- `pnpm test:hooks`
- `pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape/delivery-docs.test.ts`

## Red before, green after

- The commit `test(hooks): expect a Stop reminder …` holds the hook checks without the script: 6 failures, "No such file or directory".
- The commit `test(hooks): cover spaces, renames, commits …` (0f4ac9b) fails 3 checks against the first hook: a dismissed document named again, a path with spaces resolving to the root README, a rename not naming the folder the file left.
- The commit `test(server): …` holds the README checks without the READMEs: `docs/adr/README.md` reports `0018-deploy-on-railway.md`; the package check lists the four packages.

## Second round (reviewer findings 1–3, 9, 11; tester edge cases)

- The hook reads `git diff --name-only --no-renames HEAD` plus untracked files, so paths stay unquoted and both sides of a rename count.
- `docs-reminder` stores `head <sha>` and every document reminded since; a document is named once until the next commit.
- Rule globs are read once with awk and folders are walked with parameter expansion: 400 changed files take about 0.3 s.
- `delivery-docs.test.ts` throws when `git ls-files` fails, ignores `apps/*` or `libs/*` folders without a `package.json`, and requires `e2e/README.md`.
- README facts corrected: one worker thread in `apps/server`, how insights degrade without a model, Vite compiling `libs/history`, no formats in `libs/types` constants, the second collaboration spec.

## Hypotheses to attack

- The hook never blocks twice in one turn and never loops.
- The hook works with the input shapes both Claude Code and Codex send.
- Every fact in the five READMEs is true today.
- A renamed folder named in a README fails CI.
