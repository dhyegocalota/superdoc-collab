# A red-first claim cannot be verified after the fact when the test and the code share a commit

- Date: 2026-10-16
- Inspired by: the slice 1 tester run (`docs/features/bootstrap-and-auth/test-plan.md` → "The failing test first"), tasks 1, 3 and 5 of `docs/features/bootstrap-and-auth/plan.md`
- Revisited: 2026-10-16 — recorded at the learnings sweep before the slice 1 pull request

## Signal
The tester marks every "failing test first" box `BLOCKED`: `git log` shows one commit per task containing both the test and the implementation, and the only RED evidence is a line in an implementer report that lives in git-ignored scratch.

## Cause
The plan template asked for a RED run but let the implementer commit test and code together, so the proof evaporated with the workspace.

## Do
Commit the failing test on its own (`test(scope): …`) before the implementation commit, or keep the RED output in the report *and* name the test in the commit body. The tester then proves red-first with `git show <test commit>` plus the next commit. Promoted to `.claude/HARNESS.md` → Build.

## Anchor
`docs/features/bootstrap-and-auth/test-plan.md` (blocked rows); `.superpowers/sdd/plan/task-{1,3,5}-report.txt` (RED lines, scratch); `.claude/HARNESS.md` → Build
