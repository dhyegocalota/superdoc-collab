# Tester briefing: Security gates

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `package.json` — `security:audit` script (`pnpm audit --prod --audit-level=high`); `verify` runs it after `typecheck`.
- `.github/workflows/verify.yml` — fourth job `security`: full-history checkout, install, `pnpm security:audit`, gitleaks 8.30.1 downloaded and checksum-verified, the probe script, `gitleaks git` over every commit; no token.
- `.github/dependabot.yml` — npm and github-actions, weekly, minor and patch grouped.
- `.gitleaks.toml` — default rules plus an allowlist of the three exact placeholder strings the history contains, anchored; `.github/scripts/secret-rules-probe.sh` proves a fresh token fires and a placeholder stays silent.
- `.agents/roles/security-reviewer.md` with wrappers in `.claude/agents/` and `.codex/agents/`, registered in `.codex/config.toml`.
- `.agents/skills/open-pr/SKILL.md` gate 3b; `.agents/skills/verify/SKILL.md` steps 2 and 3; `## Security` in the PR template; HARNESS §6, §7, §9, §12.
- `apps/server/src/repository-shape/`: `agent-surfaces.test.ts`, `ci-workflow.test.ts` (security job cases). `security-config.test.ts` from the red commit was deleted after review: its cases compared config strings with themselves (`.claude/rules/testing.md`); the CI job running the commands is the proof.
- `docs/learnings/2026-10-17-pnpm-audit-is-red-because-a-dev-cli-pins-an-old-better-auth.md`.

## How to run

```bash
pnpm install --frozen-lockfile
pnpm security:audit                      # expected exit 0, one moderate advisory reported, none at high
pnpm audit --audit-level=high            # expected exit 1: every high path goes through @better-auth/cli
gitleaks git --no-banner --redact .      # expected: no leaks found (gitleaks 8.30.1 via brew)
pnpm --filter @superdoc-collab/server test:unit
pnpm test:hooks && pnpm format:check && pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| ~~`security-config.test.ts` (four cases)~~ | red at 9ffbffc as the plan records | deleted after review finding 8: they compared config strings with themselves; the `security` job running the commands is the proof |
| `ci-workflow.test.ts::the workflow runs exactly the checks, unit, docker and security jobs` | three jobs | `security` appended after `docker` |
| `ci-workflow.test.ts::the security job audits production dependencies and scans the full history for secrets` | no job | both steps and `fetch-depth: 0` |
| `agent-surfaces.test.ts::the roles are exactly the expected ones` | five roles | `security-reviewer` role file |
| `agent-surfaces.test.ts::every role …` (three cases) | pin: green at the red commit because they iterate over the role files that exist | they keep every future role in step across the three surfaces |

Red commit: `9ffbffc`. The three `ci-workflow` cases that depended on the job list (`Node jobs install…`, `bounded timeout`) were red by consequence, not by design.

## Hypotheses to attack

1. Hypothesis: the gitleaks allowlist matches only the shipped placeholders. Break it by: planting, in a scratch directory, an `AUTH_SECRET` whose value is a shipped placeholder with three extra characters appended, and running `gitleaks dir -c .gitleaks.toml`; an anchored pattern must still flag it.
2. Hypothesis: `pnpm audit --prod` hides nothing a deploy actually ships. Break it by: listing the `--prod` advisory paths and checking none of them starts at a workspace package's `dependencies`.
3. Hypothesis: the planted-secret check proves the rules fire. Break it by: using the AWS example key `AKIAIOSFODNN7EXAMPLE`; it is in gitleaks' built-in allowlist and reports nothing, so a `ghp_` token with 36 random characters is the right probe.
4. Hypothesis: `/open-pr` gate 3b's path list covers everything the security reviewer should see. Break it by: naming a path that can weaken security and is outside `apps/`, `libs/`, `e2e/`, `docker/`, `deploy/`, `.github/`, `.agents/hooks/` (for example `.mcp.json` or `.codex/config.toml`).

## Known gaps

- The `security` job has not run on GitHub yet; its first run is the proof that the pinned-binary download, the checksum check and the two scans are wired as the workflow says.
- Dependabot alerts and automated security fixes were turned on through the API on 2026-10-17; the first weekly run is the proof that the config file is read.
