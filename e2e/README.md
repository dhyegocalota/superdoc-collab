# E2E

Playwright specs that drive the built app in headless Chromium from the user's side: auth, documents and sharing, two-author collaboration, the timeline, topics, time travel and selection summaries. The runner starts its own stack on a fresh database, with a fake model server so no test calls a real model. A `/scenario` run boots the same stack on other ports for an agentic walk with one browser per author ([ADR 0023](../docs/adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)).

The local gate runs the suite whenever the diff can break what it exercises ([ADR 0028](../docs/adr/0028-the-local-gate-runs-what-the-diff-can-break.md), [HARNESS §7](../.claude/HARNESS.md#7-ship)). Conventions for every spec are in [the testing rules](../.claude/rules/testing.md) and [the E2E rules](../.claude/rules/e2e.md).
