# Security gates

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 (decisions taken in chat: audit + gitleaks + Dependabot, no CodeQL; a dedicated `security-reviewer` role rather than a longer reviewer lens)
**ADRs:** [0022](../../adr/0022-mechanical-security-gates-and-a-security-reviewer.md)
**Not changing:** product code; the general `reviewer` role keeps its security lens; CodeQL; the E2E workflow; any dependency version.

## Problem

Security in this repository is one lens of a generalist reviewer and nothing mechanical. CI never audits dependencies, never scans for leaked secrets, and the repository has no Dependabot. The production dependency tree is clean today only by luck of timing; a leaked `AUTH_SECRET` in a commit would reach a public `main` with nobody looking.

## Goals

- Every pull request runs a mechanical dependency audit and a secret scan in CI, independent of the other jobs.
- Dependabot opens a PR only for a vulnerable dependency with a fixed version (version updates are off since 2026-10-17, see ADR 0022).
- Every pull request gets a dedicated security review by a sub-agent whose only job is to attack the diff with this repository's threat model, and the verdict is in the PR body.
- The local `/verify` gate runs the same audit so a red CI is never a surprise.

## Non-goals

- Static analysis (CodeQL, Semgrep): deferred in ADR 0022.
- Auditing dev-only dependencies as a gate: `@better-auth/cli` pins a vulnerable `better-auth` 1.4 and is at its latest release; it is reported, not gated.
- Fixing any product vulnerability found by the first security review: a finding goes to its own fix with its own feature folder.
- Runtime protections (WAF, rate limits beyond what exists).

## Design

### Data flow

```
push / pull_request
  └─ verify.yml
       ├─ checks   (unchanged)
       ├─ unit     (unchanged)
       ├─ docker   (unchanged)
       └─ security (new)
            ├─ checkout with the full history
            ├─ pnpm security:audit        = pnpm audit --prod --audit-level=high
            ├─ gitleaks binary pinned by version and checksum
            ├─ .github/scripts/secret-rules-probe.sh   a fresh token fires, a shipped placeholder stays silent
            ├─ gitleaks git                            scans every commit on every branch and tag (full checkout)
            └─ gitleaks dir                            scans the checked-out tree (merge commits carry no patch), before pnpm install

weekly
  └─ Dependabot: security updates only, a repository setting

/open-pr
  gate 1  /verify            (typecheck → security:audit → unit → E2E)
  gate 3  reviewer           (unchanged)
  gate 3b security-reviewer  (new) → verdict into the PR body under ## Security
```

### Interfaces

- `package.json` scripts: `security:audit` = `pnpm audit --prod --audit-level=high`; `verify` runs it after `typecheck`.
- `.github/workflows/verify.yml`: a fourth job `security`, `timeout-minutes` bounded, no `needs`, `fetch-depth: 0`, no token: the gitleaks binary is downloaded at a pinned version and verified by SHA-256 before it runs, because the gitleaks GitHub Action scans at most the first thirty commits of a pull request and never walks into a merged lane.
- `.gitleaks.toml`: extends the default rules; allowlists only the placeholders the default rules actually report in the history (the RFC 6455 sample nonce and two test secrets), each as an exact string anchored to the whole secret (`^…$`), never a pattern with a wildcard, so a random secret that borrows a placeholder's prefix or suffix still fires. `.github/scripts/secret-rules-probe.sh` proves both directions on every CI run and in `/verify`.
- No `.github/dependabot.yml`: version updates are off (removed 2026-10-17 after the first weekly run opened five bump PRs). Dependabot alerts and automated security fixes are a repository setting, turned on 2026-10-17 through the API (`PUT /repos/{owner}/{repo}/vulnerability-alerts` and `/automated-security-fixes`).
- `.agents/roles/security-reviewer.md`: the role body. Wrappers in `.claude/agents/security-reviewer.md` and `.codex/agents/security-reviewer.toml`; registered in `.codex/config.toml`. The role reads the diff, `spec.md` and the matching `.claude/rules/`, then attacks these surfaces in order: session validation on HTTP and on the Hocuspocus socket; awareness `userId` equals the socket user; per-document authorization on documents, history, versions, media and share links; share-link secret handling and reissue (ADR 0017); SQL binding; enumeration-safe auth responses and rate limits on credential endpoints; upload size, type and path handling for DOCX; secrets in responses, logs or prompts; LLM prompts never carry another document's content; new dependencies and their postinstall scripts; CI and hook changes that widen permissions. Output: numbered findings `CRITICAL | IMPORTANT | MINOR` with file:line, the attack, the consequence and a minimal fix; then `Security verdict: CLEAR | FINDINGS | NOT APPLICABLE — <one line>`. `NOT APPLICABLE` is the answer only for a diff made of Markdown under `docs/` and READMEs; configuration, lockfiles, agent surfaces, hooks and CI count as code.
- `/open-pr` gate 3b: dispatch `security-reviewer` after the reviewer; `FINDINGS` with any `CRITICAL` or `IMPORTANT` → back to Build; `MINOR` only → listed to the owner, continue. The verdict line goes verbatim into the PR body under a new `## Security` section of `.github/pull_request_template.md`.
- `/verify`: step 2 is `pnpm security:audit`; when `gitleaks` is on `PATH`, step 3 runs `.github/scripts/secret-rules-probe.sh` and then `gitleaks git --no-banner --redact --exit-code 1 .`, and its absence is stated in the report, never silent.
- `HARNESS.md`: §6 names the second reviewer, §7 lists gate 3b, §9 adds the role row, §12 adds the CI line.

### Failure handling

- `pnpm audit` cannot reach the registry → the job fails with the network error; rerun. It never passes on a network failure.
- A production advisory with no fixed version → the CVE goes into `pnpm.auditConfig.ignoreCves` with a one-line reason in the commit body, and the security reviewer names it in the verdict; the next Dependabot PR removes the entry.
- gitleaks fires on a placeholder the repository ships on purpose → the allowlist entry names the exact string, never the whole file.
- gitleaks fires on a real secret → the PR is blocked; the secret is rotated first, then removed from history or left (rotation is the fix; history rewriting is the owner's call).
- The security reviewer answers `NOT APPLICABLE` on a diff that does touch code or configuration → the reviewer's lens 4 still ran; `/open-pr` applies the docs-only rule itself and re-dispatches with the paths named.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Which mechanical checks | audit / gitleaks / Dependabot / CodeQL | audit + gitleaks + Dependabot; CodeQL deferred | 2026-10-17 |
| Where the final security check lives | new role / longer reviewer lens | new `security-reviewer` role, gate 3b, always | 2026-10-17 |
| Audit scope | whole tree at moderate with allowlist / production at high | production at high (decided by the advisor from the audit evidence; owner can override) | 2026-10-17 |

## Test strategy summary

Repository-shape tests (Vitest, `apps/server/src/repository-shape/`): the `security` job exists with the audit, the checksum check, the probe and the full-history scan, no token, full-history checkout and a bounded timeout; every role under `.agents/roles/` has both wrappers and the Codex registration, `security-reviewer` included. The config strings themselves (`security:audit`, Dependabot, the TOML) are proven by the CI job running them, not by tests that compare a string with itself. Tester: runs `pnpm security:audit` (exit 0), `gitleaks` on the full history (zero leaks), and dispatches the `security-reviewer` on this very diff. No UI, no E2E change.
