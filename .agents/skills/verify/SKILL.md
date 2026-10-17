---
name: verify
description: Local gate — typecheck, unit tests, E2E — stopping at the first failure. Run before any "done", before /open-pr, and after every merge from main.
argument-hint: [unit|e2e|all]
allowed-tools: Bash(pnpm:*), Bash(git status:*), Read
---

Run the gate for `$ARGUMENTS` (default `all`) from the repo root, in this order, and **stop at the first failure**:

1. `pnpm typecheck`
2. `pnpm test:unit`
3. `pnpm test:e2e` (skipped when the argument is `unit`)

Rules:
- Read the full output of each step before moving on. A step passes only when its exit code is 0 and the summary line reports zero failures.
- Never add `--no-verify`, `--passWithNoTests`, `.only`, `.skip` or retries to make a step pass.
- On failure: paste the failing test names and the first error block verbatim, state the likely cause in one sentence, and stop. Do not fix anything from this command; fixing goes through the plan.
- On success: report the three summary lines (typecheck clean, N unit passed, M E2E passed) and the elapsed time.

While the product apps do not exist yet, the gate runs inside `poc/` (`pnpm typecheck && pnpm test:unit && pnpm test:e2e`), which must stay green.
