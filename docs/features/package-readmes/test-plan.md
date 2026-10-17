# Test plan: Package READMEs and docs that move with the code

## The failing test first

- [ ] `.agents/hooks/hooks.test.sh` — before `remind-docs.sh` existed; expected: 7 failures, each "No such file or directory".
- [ ] `delivery-docs.test.ts` — before the READMEs; expected: `docs/adr/README.md` reports `0018-deploy-on-railway.md` and the package check lists the four packages.

## Unit

- [ ] `pnpm test:hooks` — expected: "hooks: all checks passed".
- [ ] `pnpm --filter @superdoc-history/server exec vitest run src/repository-shape/delivery-docs.test.ts` — expected: every README's links resolve; a link in inline code or a fenced block is skipped.

## Prove it for real

Run in this worktree with a code change present, deleting `$(git rev-parse --git-dir)/docs-reminder` before each case.

- [ ] Claude Code shape: touch a file under `apps/server/src`, pipe `{"session_id":"s","hook_event_name":"Stop","stop_hook_active":false}` into the command from `.claude/settings.json` (with `CLAUDE_PROJECT_DIR` set to the worktree); expected: JSON with `"decision": "block"` naming `apps/server/README.md`; the same input again prints nothing.
- [ ] Codex shape: pipe the full Codex Stop input (`session_id`, `turn_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, `stop_hook_active`, `last_assistant_message`) into the command from `.codex/hooks.json`; expected: the same block, and nothing with `stop_hook_active: true`.
- [ ] Both hook files parse as JSON and their `Stop` entries point at `.agents/hooks/remind-docs.sh`.
- [ ] Break a link on purpose (rename a target in a README to a missing path); expected: `delivery-docs.test.ts` fails naming that README and target; restore it.
- [ ] Every README the five packages gained reads true against the code: each command exists in that package's `package.json`, each folder and file it names exists, each environment variable in `apps/server/README.md` is read by `apps/server/src`.

## Coverage honesty

- Whether a README's prose still matches behaviour is not checked mechanically; the hook, the reviewer lens and the `open-pr` docs sweep cover it by judgment.
