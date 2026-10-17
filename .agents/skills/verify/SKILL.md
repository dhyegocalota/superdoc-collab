---
name: verify
description: Local gate — runs what the diff can break (machine doctor, Prettier, secret scan, repository shape, then typecheck, audit, hooks, unit, E2E or the image as the paths require), once per commit, stopping at the first failure. Run before any "done", before /open-pr, and after every merge from main.
argument-hint: [auto|all] [--plan]
allowed-tools: Bash(pnpm verify:*), Bash(git status:*), Read
---

Run `pnpm verify $ARGUMENTS` from the repo root (default `auto`). `scripts/verify.sh` is the only list of gates and `scripts/verify-gates.tsv` the only map from paths to gates ([ADR 0028](../../../docs/adr/0028-the-local-gate-runs-what-the-diff-can-break.md)); never run the steps by hand or repeat them here.

- `auto` runs what the diff from the last green commit (or the merge base with `origin/main`, fetched first) can break; a commit that is already green runs only the secret scan and the audit. `all` runs every gate. `--plan` prints the base, the class of the whole branch against `origin/main` (`docs`, `tooling` or `product`), the gates and the unit packages, and runs nothing.
- A missing required tool stops the doctor gate; paste the report verbatim and ask before running any `fix:` line (ADR 0026). A missing `gitleaks`, or Docker when the image changed, fails its gate the same way.

Rules:
- Read the full output before claiming anything. The run passes only when it exits 0 and ends with `verify: N gates green at <sha>` or `verify: <sha> already green`.
- Never add `--no-verify`, `--passWithNoTests`, `.only`, `.skip` or retries to make a gate pass, and never write or delete a record by hand.
- On failure: paste the failing gate, the failing test names and the first error block verbatim, state the likely cause in one sentence, and stop. Fixing goes through the plan.
- On success: report the class, the gates that ran with their times, and the commit.
