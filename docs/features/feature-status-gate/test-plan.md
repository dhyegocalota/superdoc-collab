# Test plan: Feature status gate

Class `tooling`: the lead ticks with the gate output and the reviewer refutes (HARNESS §5).

## The failing test first

- [x] `feature-status.test.ts` against the tree before the corrections — expected: 3 failed — evidence: `every feature folder has a spec with a status line from the vocabulary` 4 violations, `the index has one row per feature folder` 48, `a feature whose branch was merged is shipped` 35; run of 2026-10-19 07:43
- [x] Confirmed it fails for the right reason — evidence: every violation names a slug and the two disagreeing values, none is a parse error

## Unit

- [x] `feature-status.test.ts` after the corrections — expected: 3 passed — evidence: run of 2026-10-19 07:55, `Tests 3 passed (3)`
- [x] Edge: the numbered roadmap rows (`| 1 | [slug](slug/) |`) are rows — evidence: `timeline-and-time-travel` reported `0 index rows` before the optional number column was accepted, matched after
- [x] Edge: a folder without a row — evidence: the six specs of 2026-10-19 reported `0 index rows` until their rows were added
- [x] Edge: a blank line inside a table of the index is a violation — evidence: `no blank line splits a table of the index`, the break between `mobile-horizontal-scroll` and `gate-and-scenario-tooling` on main would fail it
- [x] Edge: a PR link on an unshipped row is a violation — evidence: `pullRequestOnUnshipped` branch; no such row exists after the corrections

## Gate

- [x] `pnpm verify` on the branch — expected: green — evidence: `verify: 7 gates green at 8d5e6516 (product)`, 2026-10-19 07:57

## Adversarial review

- [x] Claim 1: a lane branch in progress never trips the merge-history test — attack: the pattern against `Merge branch 'lane/x'` and `Merge remote-tracking branch` subjects; result: held, only `Merge pull request #N from owner/<type>/<slug>` matches; the reviewer refuted the type list instead (`docs/` merges were skipped) and the pattern now takes any type
- [x] Claim 2: the dates match the merges — attack: `gh pr list --state merged --json number,mergedAt` converted to America/Sao_Paulo against the rows; result: refuted, six dates were UTC days (PRs 3, 4, 45, 63, 64, 65); rewritten
- [x] Claim 3: the spec and the row always agree after `/open-pr` — attack: read the pre-flight and the Merge step; result: held once the Merge step named the zone and commits only when a line changed

## Coverage honesty

- The test reads `git log` of the checkout: a shallow clone has no merges, so the third test throws instead of passing empty. Hosted CI does not run for this repository (ADR 0030), and every local clone is full.
- Squash merges would lose the `Merge pull request` subject; the Merge step uses `--merge`.
