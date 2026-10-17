---
name: verify
description: Local gate — typecheck, security audit, secret scan, unit tests, E2E — stopping at the first failure. Run before any "done", before /open-pr, and after every merge from main.
argument-hint: [unit|e2e|all]
allowed-tools: Bash(pnpm:*), Bash(gitleaks:*), Bash(.github/scripts/secret-rules-probe.sh:*), Bash(.agents/hooks/doctor.sh:*), Bash(git status:*), Read
---

Run the gate for `$ARGUMENTS` (default `all`) from the repo root, in this order, and **stop at the first failure**:

0. `pnpm doctor`: the machine report. A missing required tool stops the gate with the report pasted verbatim; the agent asks before running any `fix:` line (ADR 0026). Missing optional tools are reported and the gate continues
1. `pnpm typecheck`
2. `pnpm security:audit` (production dependencies at `high`, ADR 0022)
3. `.github/scripts/secret-rules-probe.sh "$(command -v gitleaks)"` then `gitleaks git --no-banner --redact --exit-code 1 .` when `gitleaks` is on `PATH`; when it is not, the report says `gitleaks: not installed, CI runs it` and the gate continues
4. `pnpm test:unit`
5. `pnpm test:e2e` (skipped when the argument is `unit`)

Rules:
- Read the full output of each step before moving on. A step passes only when its exit code is 0 and the summary line reports zero failures.
- Never add `--no-verify`, `--passWithNoTests`, `.only`, `.skip` or retries to make a step pass.
- On failure: paste the failing test names and the first error block verbatim, state the likely cause in one sentence, and stop. Do not fix anything from this command; fixing goes through the plan.
- On success: report the summary lines (doctor clean (or the optional tools missing), typecheck clean, audit clean, gitleaks clean or not installed, N unit passed, M E2E passed) and the elapsed time.
