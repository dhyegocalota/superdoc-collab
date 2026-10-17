# E2E

Playwright specs that drive the built app in headless Chromium from the user's side: auth, documents and sharing, two-author collaboration, the timeline, topics, time travel and selection summaries. The runner starts its own stack on a fresh database, with a fake model server so no test calls a real model.

CI runs the suite only on manual dispatch, suggested before a merge only when the diff can change what it exercises ([ADR 0018](../docs/adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md), [HARNESS §7](../.claude/HARNESS.md#7-ship)). Conventions for every spec are in [`.claude/rules/testing.md`](../.claude/rules/testing.md) and [`.claude/rules/e2e.md`](../.claude/rules/e2e.md).
