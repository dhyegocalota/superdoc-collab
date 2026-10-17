# Test plan: Security gates

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/repository-shape/security-config.test.ts::the security audit script gates production dependencies at high` — input: `package.json`; expected: `scripts["security:audit"]` equals `pnpm audit --prod --audit-level=high`
- [ ] `apps/server/src/repository-shape/ci-workflow.test.ts::the workflow runs exactly the checks, unit, docker and security jobs` — input: `verify.yml`; expected: job names equal `['checks', 'unit', 'docker', 'security']`
- [ ] `apps/server/src/repository-shape/agent-surfaces.test.ts::every role has its Claude Code wrapper, its Codex wrapper and its Codex registration` — input: the three surfaces; expected: `security-reviewer` present in all three
- [ ] Confirmed each fails for the right reason: the first with `expected undefined to be 'pnpm audit --prod --audit-level=high'`, the second with the job list missing `security`, the third with the missing-role list containing `security-reviewer`

## Unit

- [ ] `security-config.test.ts::verify runs the security audit right after the typecheck` — input: `scripts.verify`; expected: contains `pnpm typecheck && pnpm security:audit && pnpm test:unit`
- [ ] `security-config.test.ts::dependabot watches npm and github actions weekly` — input: `.github/dependabot.yml`; expected: both `package-ecosystem` values with `interval: weekly`
- [ ] `security-config.test.ts::gitleaks extends the default rules` — input: `.gitleaks.toml`; expected: contains `useDefault = true`
- [ ] `ci-workflow.test.ts::the security job audits production dependencies and scans the full history for secrets` — input: the `security` job; expected: contains `run: pnpm security:audit`, `uses: gitleaks/gitleaks-action@v2` and `fetch-depth: 0`
- [ ] `ci-workflow.test.ts::every job has a bounded timeout` — input: four jobs; expected: all ≤ 20 minutes
- [ ] `ci-workflow.test.ts::no job waits for another job` — input: the workflow; expected: no `needs:`
- [ ] Edge: `agent-surfaces.test.ts` — input: a role file with no Codex registration; expected: the missing list names the role (verify by temporarily removing the `security-reviewer` entry from `.codex/config.toml`, run, restore)

## E2E (Playwright specs)

- [ ] None: no user-visible behaviour changes. Stated in the PR body.

## Prove it for real — the gates themselves

- [ ] `pnpm security:audit` from the repo root; expected: exit 0 and `No known vulnerabilities found` or an equivalent empty report
- [ ] `pnpm audit --audit-level=high` (whole tree) still exits 1; expected: every high or critical path goes through `@better-auth/cli`, which is the dev-only reason recorded in ADR 0022
- [ ] `gitleaks git --no-banner --redact` on the full history; expected: `no leaks found`
- [ ] gitleaks on a planted secret: write a fake `AKIA` key in a scratch file, `gitleaks dir <scratch>`; expected: one finding; delete the file
- [ ] `/verify unit`; expected: typecheck clean, audit clean, unit green including the three new test files
- [ ] Dispatch the `security-reviewer` role on `git diff main...HEAD` of this branch; expected: a verdict line in the agreed format, and `NOT APPLICABLE` or `CLEAR` since the diff carries no product code
- [ ] On the PR: the `security` job is green and its wall time is under three minutes
- [ ] Console and network clean: not applicable

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the allowlist in `.gitleaks.toml` only matches the shipped placeholders — attack: plant a real-looking secret next to a placeholder in `.env.example` in a scratch copy; result: <refuted | held>
- [ ] Claim 2: the production audit is clean because no production dependency is vulnerable, not because `--prod` hides a path — attack: compare the `--prod` and full advisory paths; result: <refuted | held>
- [ ] Claim 3: `/open-pr` gate 3b cannot be skipped by a docs-only diff that also touches a hook — attack: read the path list in the skill against `.agents/hooks/`; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- Dependabot opening a PR — only GitHub runs it; the shape test pins the config, the first weekly run proves it.
- gitleaks-action on CI against a planted secret — would require pushing a secret-looking string to the public repository; the local `gitleaks dir` run on a scratch file proves the rules, the green CI job proves the wiring.
