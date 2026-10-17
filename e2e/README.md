# E2E

Playwright specs that drive the built app in headless Chromium from the user's side: auth, documents and sharing, two-author collaboration, the timeline, topics, time travel and selection summaries. The runner builds the web app and the server, seeds the demo users into a fresh temporary database, starts the server on port 3100 and starts a fake OpenRouter so no test calls a real model.

- `pnpm test:e2e` builds, starts the stack and runs every spec; it needs `pnpm exec playwright install chromium` once.
- `pnpm test:e2e e2e/timeline.spec.ts` runs one spec.
- `pnpm typecheck:e2e` typechecks the suite; it is part of `pnpm typecheck`.

CI runs the suite only on manual dispatch (`gh workflow run e2e.yml --ref <branch>`), suggested before a merge only when the diff can change what it exercises ([ADR 0018](../docs/adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md), [HARNESS §7](../.claude/HARNESS.md#7-ship)).

Conventions for every spec are in [`.claude/rules/testing.md`](../.claude/rules/testing.md) and [`.claude/rules/e2e.md`](../.claude/rules/e2e.md).
