# Tester briefing: Gate by path

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `scripts/verify.sh` — the gate: picks a base (newest recorded green commit with the same Node version, else the merge base with `main`), classifies the changed paths through the map, derives the unit packages and their dependents, runs the gates in order, writes a record for a clean green `HEAD`.
- `scripts/verify-gates.tsv` — the map `glob<TAB>class<TAB>gates`; first match wins; no match is `product` with every gate.
- `scripts/verify.test.sh` — scratch repository with the real script and map, stub `pnpm`, `node`, `gitleaks` and `docker` on `PATH` that log their calls.
- `package.json` — `verify` runs the script, new `test:verify`, `test:unit` includes it.
- `.github/workflows/verify.yml` and `apps/server/src/repository-shape/ci-workflow.test.ts` — the `checks` job runs `pnpm test:verify`, pinned.
- `.agents/hooks/doctor.sh` — the `gitleaks` lost text names the gate.

## Review amendments (after the first briefing)

- The class is the branch class (diff against the merge base with `origin/main`, fetched first); the record base only narrows the gates. Red before: 11 failing checks on class and gates (commit 8addc71); green in the amendment commit.
- Records are written only when the tree was clean at the start and at the end and `HEAD` did not move.
- `audit` is always on; a commit that is already green still runs `secrets` and `audit`.
- The map gained `.dockerignore`, `railway.json`, `docker-compose*.yml`; `docs/*.md` and `docs/media/*` are docs, any other file under `docs/` runs everything. `all` drops `hooks` (`test:unit` runs it).
- Changed paths are read line by line; `gitleaks` is resolved with every `node_modules/.bin` removed from `PATH`.
- `.agents/hooks/guard-verify-records.sh` is wired in `.claude/settings.json` and `.codex/hooks.json`.
- Red text printed before the amendment: `verify: 30 check(s) failed` and `hooks: 7 check(s) failed`.

## Minor amendments (second review)

- The base tip is `FETCH_HEAD` after a successful fetch, so a forged tracking ref changes nothing; a failed fetch uses `origin/main`, runs the gates and writes no record. Red before: 8 failing checks in `scripts/verify.test.sh` and 7 in `hooks.test.sh` (commit efafe0d).
- The guard blocks only commands that write (`>`, `tee`, `cp`, `mv`, `rm`, `touch`, `mkdir`, `ln`, `install`, `dd`, `truncate`, `sed -i`) beside `.git/verify`; touched paths are normalised for `..` before matching.
- `docs/install.md`, `docs/agent-install.md` and `docs/scenarios/*` are class `tooling`.
- The Docker skip line names the image's own files.

## Time zone run

- The `unit` gate runs the selected `libs/*` packages and the server a second time with `TZ=Asia/Kolkata`, as `main`'s `libs-and-server-in-kolkata` job does; a web-only change skips it. Red before: 3 failing checks (commit 94e1beb).

## How to run

```bash
bash scripts/verify.test.sh
pnpm verify --plan
pnpm verify all --plan
bash .agents/hooks/hooks.test.sh
```

`pnpm verify` without `--plan` runs the real gates and is heavy; the lead runs it.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `scripts/verify.test.sh` (45 checks) | the stub printed `verify.sh is not implemented` and exited 1; the run ended `verify: 45 check(s) failed` (commit 9564661) | the script and map exist; the run ends `verify: all checks passed` (commit 593d895) |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: a docs-only diff never runs typecheck, unit or E2E. Break it by: a `.md` path that matches an earlier row of the map (a README inside `apps/` or `libs/` that is not `README.md`, such as `apps/web/NOTES.md`, matches `apps/*` and runs the product gates, which is the safe direction).
2. Hypothesis: a record under another Node version is ignored. Break it by: editing `node:` in a record by hand, or running with a different `node` earlier on `PATH`.
3. Hypothesis: a dirty tree never writes a record. Break it by: an untracked file, a staged-only change, a change that appears only after the gates start.
4. Hypothesis: the unit packages follow `workspace:` dependencies to a fixed point. Break it by: a dependency declared only in `devDependencies`, a new package, a package whose `name` differs from its folder.
5. Hypothesis: `--plan` runs and writes nothing. Break it by: `strace`-style comparison of `.git/verify` and `git status` before and after.
6. Hypothesis: a missing `gitleaks` or Docker fails its gate with the doctor's fix. Break it by: `PATH` without them; Docker installed but the daemon stopped.
7. Hypothesis: the records are shared by every worktree of the clone. Break it by: a record from one worktree read from another.

## Known gaps

- The guard matches the command text, so a command that builds the records path from pieces evades it; it stops accidents, not an adversary.

- `pnpm verify` was never run for real by the developer (heavy-command lock); only `--plan` against this branch (`class: product`, every gate except `shape`, all four packages).
- `pnpm test:unit` and the full repository-shape suite were not run end to end. One repository-shape test, `agent-surfaces.test.ts` "the verify skill opens with the doctor script", fails against the lead's uncommitted edit of `.agents/skills/verify/SKILL.md` in this worktree; it is the lead's file.
- A path with a newline or unusual characters in its name is not handled (paths are split on whitespace).
- `shape` is dropped from the gates whenever the server's unit suite runs, on the assumption that `test:unit` of the server includes `src/repository-shape`.
- A deleted package folder is not handled (the unit step reads its `package.json`).
- The format gate prints its own `verify: format has no changed file to check` line before `format ok` when no changed file still exists.
