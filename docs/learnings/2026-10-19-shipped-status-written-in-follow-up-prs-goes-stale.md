# The index says Building for a feature that merged two days ago
- Date: 2026-10-19
- Inspired by: the brief review of 2026-10-19, which found nine merged features marked `Building`, `In review` or `Approved` in `docs/features/README.md` and 35 specs whose status line disagreed with the index
- Revisited: 2026-10-19 — promoted to HARNESS §7 → Status and `apps/server/src/repository-shape/feature-status.test.ts`

## Signal

A reader opens `docs/features/README.md` and sees `Building` or `In review` next to a feature that is live in production; `spec.md` says `Approved` while the PR merged days ago. Nothing fails, so nobody notices until an outsider reads the docs.

## Cause

The `Shipped` flip was a separate `docs/shipped-rows` PR written from memory after a batch of merges. Each batch missed some rows, nothing compared the row with the spec, and nothing compared either with the merge history. A status that only a person remembers to write is a status that drifts.

## Do

Write `Shipped <date>` on the feature branch right before the merge, never in a follow-up. `/open-pr` sets `In review` when the PR opens and `Shipped` at its Merge step; the `feature` skill adds the index row at scaffold time. `feature-status.test.ts`, in the `shape` gate of every class, fails when a status leaves the vocabulary, a folder has no row, a row disagrees with its spec, or a merged pull request from a branch named after a folder, whatever its type prefix, left the spec unshipped. Dates are the merge day in America/Sao_Paulo: `gh` reports UTC, and a merge after 21:00 falls on the next UTC day.

## Anchor

`apps/server/src/repository-shape/feature-status.test.ts`, `.claude/HARNESS.md` §7 → Status, `.agents/skills/open-pr/SKILL.md` (Pre-flight and Merge), `.agents/skills/feature/SKILL.md` step 7, `docs/features/README.md` → Rules
