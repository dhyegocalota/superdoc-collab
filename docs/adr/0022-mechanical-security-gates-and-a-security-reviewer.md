# 0022. Mechanical security gates in CI and a dedicated security reviewer before every PR

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `.agents/roles/reviewer.md` lens 4, `pnpm audit` on 2026-10-17 (fifteen advisories, all high ones under the dev-only `@better-auth/cli`), [ADR 0018](0018-fan-out-ci-and-prebuild-the-projection-worker.md)

## Context

Security was one lens of the general `reviewer` role, next to conventions, correctness, performance and refutation, and nothing in CI checked dependencies or leaked secrets. The reviewer's attention is split eight ways; a leaked `AUTH_SECRET` in a commit or a known-vulnerable dependency reached `main` unnoticed unless a human looked. The repository is public and the demo runs on the internet, so both matter.

`pnpm audit` on the whole tree is red today: every high and critical advisory sits under `@better-auth/cli`, a dev-only tool that pins `better-auth` 1.4 while the app ships 1.7. The production tree is clean at `high`.

## Decision

1. CI gains a `security` job in `verify.yml`, independent of the others (ADR 0018): `pnpm security:audit` (`pnpm audit --prod --audit-level=high`) and a `gitleaks git` scan of every commit on every branch and tag (`git log --all` on a full checkout), run from a binary pinned by version and SHA-256 rather than the GitHub Action, which reads at most thirty pull-request commits and never walks into a merged lane. A probe step proves the rules fire on a fresh token and stay silent on a shipped placeholder. Dependabot opens weekly version updates for npm and GitHub Actions, and security updates since the repository's alerts and automated fixes were turned on the same day.
2. The audit gate covers **production dependencies at `high` and above**. Dev-only advisories are not a gate; they are reviewed when the tool that pins them is updated. A production advisory with no fix lands in `pnpm.auditConfig.ignoreCves` with the CVE and the reason in the same commit, never silently.
3. A dedicated `security-reviewer` role (fresh context, read-only, strongest model) runs on every diff before the PR opens, after the general reviewer, with this repository's threat model as its checklist. Its verdict (`CLEAR | FINDINGS | NOT APPLICABLE`) goes into the PR body under `## Security`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| `security` job + `gitleaks` + Dependabot + `security-reviewer` role (chosen) | Mechanical checks catch the boring leaks; a single-purpose agent attacks the diff instead of skimming it | One more CI job (about a minute); one more sub-agent per PR | — |
| Add CodeQL as well | Free on a public repository; finds injection patterns | Five or more minutes per PR; low signal on a small Hono + React monorepo whose risky surfaces are already enumerated | Deferred; revisit when the server grows beyond one process |
| Keep security as lens 4 of the general reviewer, with a longer checklist | No new role, no extra cost | The same agent that checks naming and tests consistently under-weights attack paths; nothing mechanical ever runs | Judgment alone missed nothing yet, but it never ran a scanner either |
| Audit the whole tree at `moderate` with an allowlist | Catches dev tooling too | Red on day one for advisories nobody can fix (`@better-auth/cli` is at its latest); the allowlist becomes the norm | A gate that starts with exceptions trains everyone to add more |

## Consequences

- `pnpm security:audit` runs locally in `/verify` and in CI; a new production advisory at `high` blocks the merge until the dependency is bumped or the CVE is listed with a reason.
- `gitleaks git` scans every commit on every branch and tag, so a secret on any branch reddens every PR until that branch is cleaned, which is the point on a repository whose branches are all shared; `gitleaks dir` scans the checked-out tree, because `git log -p` prints no patch for a merge commit and a secret first added while resolving a merge would otherwise pass; the tree scan runs before the dependencies are installed so `node_modules` is never scanned. A leaked secret blocks the PR and must be rotated, not only removed. Local `/verify` runs the history scan only; the tree scan is CI's. The allowlist holds exact anchored strings only; a pattern with a wildcard would let a random secret borrow a placeholder's name.
- Dependabot PRs follow the same gates as any PR: `/verify`, reviewer, security reviewer.
- Amended 2026-10-17: Dependabot version updates are off. The first weekly run opened five bump PRs, among them a major of the collaboration provider, and the owner judged them noise ("desabilita o dependabot, ou então limita só pra atualizações críticas"). `.github/dependabot.yml` is removed; the repository settings for alerts and automated security fixes stay on, so Dependabot opens a PR only for a vulnerable dependency that has a fixed version.
- `/open-pr` gains gate 3b: the `security-reviewer` verdict. `FINDINGS` at `CRITICAL` or `IMPORTANT` goes back to Build.
- Three agent surfaces (`.agents/roles`, `.claude/agents`, `.codex/agents`) gain one role; the repository-shape test keeps them in step.

## Evidence

- `pnpm audit --audit-level=high` exits 1 (fifteen advisories); `pnpm audit --prod --audit-level=high` exits 0 on 2026-10-17.
- Every high or critical advisory resolves through `apps/server > @better-auth/cli 1.4.21`, which is the latest release.

## Revisit when

- `@better-auth/cli` releases a version that follows `better-auth` 1.7, so the dev tree can be audited at `high` too.
- The server grows a second process or an SSR surface, where CodeQL's taint tracking would pay for its minutes.
- A security finding reaches `main` through a path neither the scanners nor the role covers.
