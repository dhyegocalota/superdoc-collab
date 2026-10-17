# Test plan: Package READMEs and docs that move with the code

## The failing test first

- [x] `.agents/hooks/hooks.test.sh` — before `remind-docs.sh` existed; expected: 7 failures, each "No such file or directory". — evidence: c8d76b6 in a temporary worktree: `bash .agents/hooks/hooks.test.sh` exits 1 with `hooks: 6 check(s) failed`, 6 `FAIL` lines, each `.../.agents/hooks/remind-docs.sh: No such file or directory` (6, not the 7 the plan states; the briefing also says 7; the file has 6 docs-reminder checks, so the number in the plan is off by one, behaviour as expected). Worktree removed.
- [x] `delivery-docs.test.ts` — before the READMEs; expected: `docs/adr/README.md` reports `0018-deploy-on-railway.md` and the package check lists the four packages. — evidence: 81978a2 in a temporary worktree (node_modules symlinked): `2 failed | 9 passed (11)`; `docs/adr/README.md` -> `expected [ '0018-deploy-on-railway.md' ] to deeply equal []`; package check -> `[ 'apps/server', 'apps/web', 'libs/history', 'libs/types' ]`. Worktree removed.

## Unit

- [x] `pnpm test:hooks` — expected: "hooks: all checks passed". — evidence: a197819: `hooks: all checks passed`
- [x] `pnpm --filter @superdoc-collab/server exec vitest run src/repository-shape/delivery-docs.test.ts` — expected: every README's links resolve; a link in inline code or a fenced block is skipped. — evidence: a197819: `Test Files 1 passed (1)`, `Tests 16 passed (16)`; verbose run lists one link test per README (apps/server, apps/web, e2e, libs/history, libs/types, root, docs/adr, docs/features, docs/learnings, .agents/skills, two runbooks) plus `a link written as inline code or inside a fenced block is not checked` and `every workspace package has a README`, all green

## Prove it for real

Run in this worktree with a code change present, deleting `$(git rev-parse --git-dir)/docs-reminder` before each case.

- [x] Claude Code shape: touch a file under `apps/server/src`, pipe `{"session_id":"s","hook_event_name":"Stop","stop_hook_active":false}` into the command from `.claude/settings.json` (with `CLAUDE_PROJECT_DIR` set to the worktree); expected: JSON with `"decision": "block"` naming `apps/server/README.md`; the same input again prints nothing. — evidence: new untracked file `apps/server/src/index.ts`, command taken from `.claude/settings.json` via jq with `CLAUDE_PROJECT_DIR` set: first run printed `"decision": "block"` ... `.claude/rules/collaboration.md` `.claude/rules/history.md` `apps/server/README.md`; second identical run printed nothing (0 bytes, rc 0). File removed, docs-reminder removed
- [x] Codex shape: pipe the full Codex Stop input (`session_id`, `turn_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, `stop_hook_active`, `last_assistant_message`) into the command from `.codex/hooks.json`; expected: the same block, and nothing with `stop_hook_active: true`. — evidence: full 9-field Codex input piped into the command from `.codex/hooks.json`: first run printed the same block naming `apps/server/README.md`, second identical run 0 bytes; with `stop_hook_active:true` (state file deleted first) 0 bytes and no state file written; Claude shape with `stop_hook_active:true` also 0 bytes
- [x] Both hook files parse as JSON and their `Stop` entries point at `.agents/hooks/remind-docs.sh`. — evidence: `jq -e '.hooks.Stop[0].hooks[0].command'` on both files: `"$CLAUDE_PROJECT_DIR"/.agents/hooks/remind-docs.sh` and `"$(git rev-parse --show-toplevel)/.agents/hooks/remind-docs.sh"`; both parse
- [x] Break a link on purpose (rename a target in a README to a missing path); expected: `delivery-docs.test.ts` fails naming that README and target; restore it. — evidence: changed `(src/http/)` to `(src/htpp/)` in `apps/server/README.md`: `× every relative link in apps/server/README.md ...`, `expected [ 'src/htpp/' ] to deeply equal []`, `1 failed | 15 passed (16)`; `git checkout apps/server/README.md`, `git diff --stat` empty. Also renamed the real folder `apps/server/src/http` to `http2`: fails with `src/http/`; restored
- [x] Every README the five packages gained reads true against the code: each command exists in that package's `package.json`, each folder and file it names exists, each environment variable in `apps/server/README.md` is read by `apps/server/src`. — evidence: commands: web dev/build/preview/typecheck/test:unit, server dev/build/start/seed/typecheck/test:unit, history typecheck/test:unit/generate, types typecheck/test:unit, e2e `test:e2e`/`typecheck:e2e` all exist in the matching `package.json`; every linked or backticked file and folder exists (only runtime files `auth.sqlite`, `history.sqlite`, `read-model.sqlite`, alias `@/` do not, and each is named in code or `tsconfig`/vite alias); all 12 environment variables in `apps/server/README.md` are read under `apps/server/src` (`.env.example` also has `SEED_DEMO_USERS`, read only by `docker/entrypoint.sh`, not in the README); tsup entries, externals and noExternal, Vite proxy `/api` and `/collaboration` to port 3000, e2e port 3100, `libs/history` exports `.`, `./timeline`, `./testing`, `libs/types` sole dependency zod, four demo accounts, Dockerfile copies both drizzle sets, all true

## Second round (after the review fixes)

- [x] `pnpm test:hooks` with `bash` and with `/bin/bash` 3.2 — expected: "hooks: all checks passed" both times. — evidence: d674cf2: `pnpm test:hooks` and `/bin/bash .agents/hooks/hooks.test.sh` (both GNU bash 3.2.57) print `hooks: all checks passed`
- [x] 400 untracked files under one documented folder — expected: one block within 1 s. — evidence: d674cf2: 400 files under `apps/web/src/bulk/`, `decision` = `block`, `real 0m0.296s`; files removed
- [x] Move `e2e/` aside — expected: `delivery-docs.test.ts` fails on `every workspace package and e2e has a README`; restore it. — evidence: d674cf2: `× every workspace package and e2e has a README`, `expected [ 'e2e' ] to deeply equal []`, `1 failed | 15 passed (16)`; restored, unmoved run `16 passed (16)`
- [x] Re-run the two edge cases above that failed in the first round — expected: both pass. — evidence: d674cf2: space file and directory name `apps/web/README.md` and `.claude/rules/collaboration.md`; e2e rename fails as above

## Adversarial review

The reviewer picked the three claims most likely to be wrong.

- [x] Claim 1: the hook never blocks twice and never loops — attack: dismiss one of two documents, then commit and edit the same folder again; result: refuted in round one (re-nagged the dismissed rule, then silent forever after a commit), fixed in d674cf2, held on re-review with the regression checks in 0f4ac9b.
- [x] Claim 2: every fact in the five READMEs is true — attack: each statement against the code; result: refuted in round one (worker threads, insights degradation, Vite compiling `libs/history`, "formats", the second collaboration spec), corrected in d674cf2, held on re-review.
- [x] Claim 3: a renamed folder named in a README fails CI — attack: rename a path written as inline code; result: held for linked paths, refuted for inline-code paths, accepted and recorded below.

## Coverage honesty

- A path written only as inline code (for example `scripts/with-env.sh` in `apps/server/README.md`) is not link-checked; inline code is skipped so placeholders like `NNNN-slug.md` do not fail. Link a path when its rename should fail CI.
- Whether a README's prose still matches behaviour is not checked mechanically; the hook, the reviewer lens and the `open-pr` docs sweep cover it by judgment.

## Edge cases found during execution

- [x] Staged rename `git mv apps/server/src/seed.ts seed2.ts` — evidence: porcelain `R  old -> new`, hook names `apps/server/README.md` and the two rules (new path used); restored with `git mv` back
- [x] Deleted tracked file `apps/server/src/seed.ts` — evidence: ` D`, hook names `apps/server/README.md` and the two rules; restored with `git checkout`
- [x] README edited alone (`apps/web/README.md`) — evidence: silent, 0 bytes; `git checkout` restored
- [x] Code and its README both changed (`apps/web/src/zz.ts` + `apps/web/README.md`) — evidence: only `.claude/rules/collaboration.md` named, README correctly dropped
- [x] Untracked nested directory with no README (`libs/newpkg/src/deep/f.ts`) and a root file (`rootfile.txt`) — evidence: both name root `README.md`, as designed
- [x] Unicode filename `apps/web/src/ação.ts` — evidence: names `apps/web/README.md` and `collaboration.md` (core.quotePath=false works)
- [x] Gitignored file (`.pr-media/x/a.png`) — evidence: silent
- [x] Outside a git repository, and empty stdin — evidence: both rc 0, no output
- [x] Document set widens after a reminder (`apps/web` then also `libs/types`) — evidence: second block fires naming the three documents, then silent on repeat
- [x] Path with a space, directory (`apps/web/src/my dir/a.ts`) or file (`apps/web/src/b c.ts`) — FAILED: hook names only the root `README.md`, never `apps/web/README.md` nor any rule; expected `apps/web/README.md` and the rules that match. Cause: `git status --porcelain` wraps such paths in double quotes (`?? "apps/web/src/b c.ts"`, still quoted with `core.quotePath=false`); the script strips only the status prefix, so `-f "\"apps/web/...` and the rule globs never match and the walk up falls to `.`. Reproduce: create the file, delete `$(git rev-parse --git-dir)/docs-reminder`, pipe `{"stop_hook_active":false}` into `.agents/hooks/remind-docs.sh`. Needs a regression case in `hooks.test.sh` and a fix (for example `status --porcelain -z`) from the developer — re-run after d674cf2: `apps/web/src/b c.ts` and `apps/web/src/my dir/a.ts` now name `.claude/rules/collaboration.md` `apps/web/README.md`; files removed
- [x] Renaming the `e2e/` folder — FAILED to be caught: with `e2e/` moved to `e2e-renamed`, `delivery-docs.test.ts` still passes 16/16 (no linked README points at `e2e/`, `readmes()` silently skips a README that no longer exists, and the "every workspace package has a README" check covers `apps/*` and `libs/*` only although `AGENTS.md` says `e2e/` needs one). Restored. Low severity; request a check that `e2e/README.md` exists — re-run after d674cf2: `delivery-docs.test.ts` fails `every workspace package and e2e has a README`, `[ 'e2e' ]`; restored, 16/16
- [x] Malformed JSON on stdin — evidence: `jq: parse error` on stderr, rc 0, hook carries on (treats `stop_hook_active` as false); harmless
- [x] Staged rename re-check — evidence: after d674cf2 `git mv apps/server/src/seed.ts libs/types/src/seed.ts` names `apps/server/README.md` and `libs/types/README.md` (both sides) plus `history.md` and `collaboration.md`; same-folder rename names `apps/server/README.md`; both moved back, `git status` clean
- [x] Once-per-commit state — evidence: d674cf2: `docs-reminder` holds `head <sha>` then the documents; second identical Stop prints 0 bytes
