# Tester briefing: Agent doctor

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `.agents/hooks/doctor.sh`: new; one line per tool (`node pnpm jq gh chromium skills gitleaks ffmpeg docker`), `--fix <tool>`, exit 1 when a required tool is missing; reads `DOCTOR_UNAME`, `DOCTOR_PATH`, `DOCTOR_HOME`, `DOCTOR_SKIP`
- `.agents/hooks/touched-files.sh`, `.agents/hooks/guard-git-add-all.sh`: `require_jq` makes the guards exit 2 with the doctor's fix line when `jq` is absent
- `.agents/hooks/hooks.test.sh`: `doctor:` checks and the two guard checks
- `.claude/settings.json`, `.codex/hooks.json`: `SessionStart` runs the doctor with `|| true`
- `.agents/skills/verify/SKILL.md`: gate 0 `.agents/hooks/doctor.sh`
- `.github/workflows/verify.yml`: `.agents/hooks/doctor.sh` step in `checks` with `DOCTOR_SKIP: chromium`
- `.claude/HARNESS.md`: invariant 11, "Image proof without Docker", the ask-first line, the `doctor.sh` hook row and the guard sentence
- `docs/install.md`, `README.md`, `docs/features/README.md`: "Develop with an agent", the Read more link, status `Building`

## How to run

```bash
bash .agents/hooks/hooks.test.sh
bash .agents/hooks/doctor.sh
cd apps/server && node_modules/.bin/vitest run src/repository-shape
claude   # a fresh session in a worktree of this branch
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `.agents/hooks/hooks.test.sh` (`doctor:` checks) | `doctor.sh` does not exist | `doctor.sh` prints the report and the exit code |
| `.agents/hooks/hooks.test.sh` (`guard-secrets without jq`, `guard-git-add-all without jq`) | the guards exit 0 without `jq` | the guards exit 2 with the fix line |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: the `SessionStart` hook fires and the `doctor:` summary line is in the first turn's context. Break it by: open a fresh Claude Code session and a Codex session in a worktree, hide a tool through `PATH`, read the context.
2. Hypothesis: `Edit` on `.env` is blocked with the fix line when `jq` is hidden. Break it by: run a session with `jq` off `PATH` and try `Edit`, `Write` and `git add -A`.
3. Hypothesis: `.agents/hooks/doctor.sh` on CI is green with `GH_TOKEN` from `github.token` and `chromium` skipped. Break it by: dispatch `verify.yml` on the branch and read the `checks` job.
4. Hypothesis: the Linux fix lines are right. Break it by: run `DOCTOR_UNAME=Linux .agents/hooks/doctor.sh` with `DOCTOR_PATH` holding one package manager at a time, and compare each `fix:` with that manager's real syntax.
5. Hypothesis: `/verify` stops at gate 0 on a missing required tool and continues on a missing optional one. Break it by: run `/verify unit` with `jq` hidden, then with `ffmpeg` hidden.

## Known gaps

- No Linux machine at hand: Linux is pinned by `DOCTOR_UNAME` only.
- Whether Codex adds `SessionStart` stdout to the context is unverified.
