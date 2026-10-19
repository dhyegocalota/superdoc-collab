# Feature status gate

**Status:** In review
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 ("corrige status dos docs e já corrige as regras de harnessing pra não deixar mais isso acontecer")
**ADRs:** none
**Not changing:** the feature folders' contents beyond their status line, the roadmap summaries, `scripts/verify.sh`

## Problem

The brief review of 2026-10-19 found nine merged features marked `Building`, `In review` or `Approved` in `docs/features/README.md`, one row twice, a blank line that split the table, five approved specs without a row, and 35 specs whose status line disagreed with the index. The `Shipped` flip lived in follow-up `docs/shipped-rows` PRs written from memory, and nothing checked the row against the spec or either against the merge history.

## Change

- Every spec status and index row set from the merge history (`gh pr list --state merged`, merge days in America/Sao_Paulo), PR links on the repository's current name, the duplicate row and the table break removed, six rows added for the approved specs of 2026-10-19.
- `apps/server/src/repository-shape/feature-status.test.ts`, in the `shape` gate of every class: the status vocabulary, one row per folder and none without a folder, row equal to spec with the PR link only on a shipped row, and `Shipped` for every folder whose branch (`<type>/<slug>`, whatever the type) was merged through a pull request; a shallow clone fails the check instead of passing it empty.
- The `unit` job of `verify.yml` checks out the full history (`fetch-depth: 0`), pinned by `ci-workflow.test.ts`, for the day hosted runs come back.
- HARNESS §7 → Status and §12, `/open-pr` (`In review` at pre-flight, `Shipped` committed on the branch at the Merge step), the `feature` skill (the row at scaffold time), the index rules, and a learning.

## Test list

- The three tests of `feature-status.test.ts` red against the tree before the corrections (3 failed: 4 vocabulary, 48 row, 35 merge-history violations), green after.
- `pnpm verify` on the branch.
