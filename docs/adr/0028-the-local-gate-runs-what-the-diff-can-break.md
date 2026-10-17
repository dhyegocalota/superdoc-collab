# 0028. The local gate runs what the diff can break

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: a mental walk of a one-word README change through the harness (four to five sub-agents and two to four full gate runs, E2E included); GitHub Actions refusing every job since 2026-10-17 for account billing, with the owner declining to pay; [ADR 0018](0018-fan-out-ci-and-prebuild-the-projection-worker.md); [ADR 0022](0022-mechanical-security-gates-and-a-security-reviewer.md); the learning [pnpm's changed-since filter selects nothing in a linked worktree](../learnings/2026-10-17-pnpm-changed-since-selects-nothing-in-a-linked-worktree.md)

## Context

The gate was written three times (the `verify` script in `package.json`, the `/verify` skill, the local stand-in for CI kept in the agent's memory) and the three lists disagreed. Every run was the whole gate whatever the diff: a README typo paid typecheck, every unit suite and the E2E suite, and paid it again at `/open-pr`, after each review fix, before the merge and after each merge from `main`. Each step was a separate shell call, so on the owner's machine each one queued separately behind the machine-wide lock that serialises heavy commands.

Hosted CI no longer runs: the account's Actions jobs are refused and the owner will not pay for them. The harness still told agents to wait for `verify` runs on GitHub and to accept "proven by the `docker` job of CI" for image changes, so the only real proof is the local one.

## Decision

1. **One executable gate.** `scripts/verify.sh`, run as `pnpm verify [auto|all] [--plan]`, is the only list of gates. The `/verify` and `/open-pr` skills and `HARNESS.md` call it and never repeat its steps.
2. **A map from paths to gates.** `scripts/verify-gates.tsv` maps globs to gates, first match wins per path, the union across paths is run. A path no rule matches runs everything, as do changes to the map, the script, the workspace manifests, the lockfile and the toolchain pins. Renames count on both sides; uncommitted and untracked files count. The doctor, Prettier on the changed files, the secret scan and the repository-shape tests always run, because they cost seconds.
3. **Unit runs the changed packages and their dependents.** The script reads the workspace dependencies from each package's `package.json`. pnpm's own changed-since filter was rejected by the spike.
4. **Incremental by commit.** A green `auto` or `all` run on a clean tree writes a record for its commit under the git common directory, so every worktree shares it. The next run diffs from the newest ancestor that has a record made with the same Node version, and from the merge base with `main` when none has one. An empty diff from a recorded commit runs nothing. This one rule covers the rerun after a review fix, the merge from `main` and the check before a merge.
5. **The docs lane.** A change whose class is `docs` (the script prints it) and that no person or agent follows step by step (install guides, runbooks, the agent install file) takes the docs lane: a ten-line `spec.md`, no plan, test plan or tester, one reviewer on the mid model, no security reviewer. The class is necessary, never sufficient: the lead still judges the content. A one-line change to code or configuration is never the docs lane.
6. **Tooling needs no tester.** A change of class `tooling` keeps spec, plan and test plan; the lead ticks the test plan with the gate output as evidence and the reviewer refutes it, as for a behaviour-preserving refactor.
7. **The gate is local.** Merges gate on `pnpm verify` on the branch head after merging `main`, with its summary posted as a PR comment. `.github/workflows/` stay as the definition of the hosted gate for the day Actions comes back, and their repository-shape tests keep them true. A change to `docker/` or `deploy/` needs Docker on the machine: the `docker` gate fails without it. Any other run that selects the gate prints that it was skipped when Docker is not running, because the doctor keeps Docker optional.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Three classes (`docs`, `tooling`, `product`) decide the gates | Simple to explain | A test-only or E2E-only change pays for packages it cannot break; config files fit none | The map is as short and exact per path; classes stay as labels only |
| pnpm `--filter "...[ref]"` picks the packages | No code | Selected nothing in a linked worktree, even for a committed change; ignores untracked files | Rejected by the spike |
| Playwright `--only-changed` for E2E | Shorter E2E | Follows the imports of spec files, not application source | Application changes would select no spec |
| Cache the whole result by commit only | Simplest | Reuses a green run after Node or the lockfile install changed | Records carry the Node version; the lockfile is in the commit |
| Keep waiting for hosted CI | No process change | Every run is refused | The owner declined to pay |

## Consequences

- A docs change verifies in seconds; a change to one app skips the other's unit suite; a change to `libs/types` still runs every dependent and E2E.
- The gate trusts that `main` is green. A push straight to `main` that bypassed the gate breaks the induction; `pnpm verify all` is the explicit full run.
- A record is only as honest as the run that wrote it: only the script writes records, only on a clean tree, only after every chosen gate passed.
- The heavy-command lock on the owner's machine must know `pnpm verify`; the owner's hook gained the word.

## Evidence

The spike of 2026-10-17 (see the learning), and `scripts/verify.test.sh`.

## Revisit when

GitHub Actions runs again, the workspace gains a package that is not under `apps/` or `libs/`, or a green record is ever found to hide a red gate.
