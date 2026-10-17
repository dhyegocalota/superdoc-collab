# Plan: Security gates

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `verify.yml` jobs (ADR 0018 fan-out), the `/verify` and `/open-pr` gate lists, the three agent surfaces (ADR 0014).
**Assumptions (decided, owner can override):**
- The audit gate is production dependencies at `high`; dev-only advisories are reported in the ADR, not gated.
- gitleaks runs with the default rules plus an allowlist of the exact placeholder strings the repository ships on purpose.
- ADR numbers 0020 and 0021 are left to the in-flight branches that already use them; this feature takes 0022.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/repository-shape/ci-workflow.test.ts`, `apps/server/src/repository-shape/security-config.test.ts`, `apps/server/src/repository-shape/agent-surfaces.test.ts`, `.github/workflows/verify.yml`, `.github/dependabot.yml`, `.gitleaks.toml`, `package.json` (scripts only) | lead, inline |
| G2 | `.agents/roles/security-reviewer.md`, `.claude/agents/security-reviewer.md`, `.codex/agents/security-reviewer.toml`, `.codex/config.toml`, `.agents/skills/open-pr/SKILL.md`, `.agents/skills/verify/SKILL.md`, `.github/pull_request_template.md`, `.claude/HARNESS.md`, `docs/learnings/*` | lead, inline |

## Sequencing

G1 first (tests red, then the files that turn them green), then G2. Both run inline: every step fits in three tool calls and the lead is the only writer.

## Steps

### G1

- [x] **Step 1:** `security-config.test.ts` and the `security` job cases in `ci-workflow.test.ts` committed red: `pnpm security:audit` script, `verify` ordering, the `security` job with audit and gitleaks steps, `fetch-depth: 0`, bounded timeout, Dependabot ecosystems, `.gitleaks.toml` extending the defaults.
- [x] **Step 2:** `package.json` scripts, `verify.yml` job, `.github/dependabot.yml`, `.gitleaks.toml`; the tests go green; `pnpm security:audit` exits 0; `gitleaks git` on the full history reports zero leaks.

### G2

- [x] **Step 3:** `agent-surfaces.test.ts` committed red: every role under `.agents/roles/` has a `.claude/agents/<role>.md` wrapper that names the role file, a `.codex/agents/<role>.toml` wrapper and a `.codex/config.toml` registration; `security-reviewer` is in the expected list.
- [x] **Step 4:** the role body and the three registrations; the test goes green.
- [x] **Step 5:** `/open-pr` gate 3b, `/verify` steps 2 and 3, `## Security` in the PR template, HARNESS §6 §7 §9 §12, learning on the dev-only audit noise.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | gitleaks flags the shipped placeholders | `gitleaks git` lists `.env.example` or `playwright.config.ts` | allowlist the exact strings in `.gitleaks.toml`, never the files |
| 2 | `pnpm audit` is red in CI but green locally (registry drift) | the `security` job fails on an advisory id not seen locally | bump the dependency or list the CVE with a reason in the same commit |
| 2 | gitleaks-action needs a licence | job log says `GITLEAKS_LICENSE` is required | the action is free for personal repositories; if the log disagrees, pin the binary step instead of the action |
| 4 | Codex rejects the config entry | `.codex/config.toml` parse error in the Codex log | copy the exact shape of the `reviewer` entry |
| 5 | `/open-pr` dispatches the security reviewer on a docs-only diff and wastes a prompt | the verdict is `NOT APPLICABLE` on a diff with no code paths | gate 3b skips the dispatch when `git diff --name-only` has no path under the code roots |

**Steps with no backout:** none; every file is new or additive and reverts cleanly.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** not applicable, no UI touched.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
