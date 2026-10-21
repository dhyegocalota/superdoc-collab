---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/tests/**"
---

# Testing

## Tools
- Vitest for unit tests (`pnpm test:unit`), Playwright with headless Chromium for E2E (`pnpm test:e2e`). (package.json, playwright.config.ts)

## Universal invariant
Every E2E asserts: all clients converge, server text equals client text, replay equals live (state vector), and `sum(inserted) - sum(deleted) == final length - initial length`. (ADR 0001)

## Conventions
- Test names are in present tense and never start with "should". (project convention)
- No `sleep`; wait on conditions with `expect.poll`, `toPass` or `waitForFunction`. (project convention)
- Under concurrency, judge completion by length, never by marker order, because the caret can land out of order. (docs/learnings/2026-10-15-click-steals-editor-focus-under-load.md)
- Mock the LLM provider; no test calls a real model. (ADR 0006)

## What a useful test is
- A test pins behaviour, a learning or something the user sees. Delete tests that pin prose, YAML or a constant equal to itself. (refinement-tests audit, 2026-10-17)
- A service test whose route twin asserts the same behaviour folds into the route test. Prove the fold with a mutation check before deleting. (refinement-tests)
- Assert outcomes and `aria-*` / `data-*` attributes, never Tailwind class strings and never a timer spy paired with its call. Pure styling is proven by screenshots in the test plan. (refinement-tests, refinement-ux-care spec)
- Bound a real wait by injecting a short timeout into the code under test, never by waiting out the production one. (refinement-tests)
- Size a CI deadline from the event that starts it: a socket close is measured from `open`, and the deadline is 8 s, not 3 s. (`UNAUTHENTICATED_CLOSE_DEADLINE_MS` in apps/server/src/collaboration/attach-collaboration.test.ts)
- Every parameterised check is one `test.each` table, not copies of the same test. (refinement-tests)
- A fake-timer test never depends on the real clock: no `Date.now()` or `shouldAdvanceTime` mixed with fake timers in new tests. (refinement-tests spec)
- E2E authoring facts live in `.claude/rules/e2e.md`.
