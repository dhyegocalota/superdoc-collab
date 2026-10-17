# A commit from one lane sweeps in files another lane staged in the same worktree

- Date: 2026-10-16
- Inspired by: slice 2 execution — commit `ea27dbc` (lane A) carried lane C's staged deletion of `apps/web/src/routes/documents-page.tsx`; commit `dbdaee5` carried the tester's test-plan edits
- Revisited: 2026-10-16 — rule applied to every later commit; one more harmless recurrence (docs only)
- Revisited: 2026-10-17 — still true; one worktree per lane, ownership lists and merge-not-rebase are now in `.claude/HARNESS.md` → Parallel lanes and the developer role

## Signal
`git show --stat` of a commit lists a file outside the author's ownership group, and the other lane's next commit is missing a change it made.

## Cause
Parallel developer sub-agents share one checkout and one git index. `git add <files>` by one lane and `git commit` by another interleave.

## Do
Stage and commit in one shell command (`git add <files> && git commit …`), then check `git show --stat HEAD` lists only the lane's paths; report foreign files instead of amending. For long parallel work prefer one worktree per lane. Promoted to the developer role body.

## Anchor
`.agents/roles/developer.md`; ledger of `docs/features/documents-and-history`
