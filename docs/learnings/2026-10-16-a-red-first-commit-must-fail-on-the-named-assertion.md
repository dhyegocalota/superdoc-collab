# A red-first commit must fail on the named assertion, not on a missing module or a broken helper

- Date: 2026-10-16
- Inspired by: slice 3 tester, "failing test first" boxes for Task 9 (`94cb1c1`: a shared test helper imported a module that did not exist yet, so every server suite failed at import) and Task 13 (`efdfffa`: the suite failed on missing viewer modules instead of on `SuperDoc` being constructed once); sibling of [a red-first claim cannot be verified when test and code share a commit](2026-10-16-commit-the-failing-test-first.md)
- Revisited: 2026-10-16
- Revisited: 2026-10-17 — still true; every refinement lane used throwing stubs in its red commits. The stub rule and the pin label are now in `.claude/HARNESS.md` section 4 and the developer role

## Signal
The test plan's box says "fails with X, not with a missing module", the tester checks out the test commit, and the whole suite dies at import or on `Cannot find module` — the box cannot be ticked although the implementation is fine.

## Cause
Tests committed first import helpers and modules the same task creates later; when the helper lives in a shared file (`testing/*`), the import failure takes every other suite with it. A red run that fails before reaching the assertion proves nothing about the behaviour.

## Do
In the test commit, import only what already exists, or add the new module as a stub that throws `NotImplemented` so the named assertion is reached; keep shared test helpers free of imports from the task's new modules until the implementation commit; state the expected failure line in the plan and check it in the red run before committing.

## Anchor
`docs/features/timeline-and-time-travel/test-plan.md` ("The failing test first"), `.agents/roles/developer.md`
