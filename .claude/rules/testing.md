---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/tests/**"
---

# Testing

## Tools
- Vitest for unit tests (`pnpm test:unit`), Playwright with headless Chromium for E2E (`pnpm test:e2e`). (poc/package.json, poc/RESULTS.md)
- Each E2E starts its own server and chaos proxy through `startStack`. (poc/tests/harness.ts)
- Playwright runs with `workers: 1`. (poc/playwright.config.ts)

## Harness API (poc/tests/harness.ts)
- `startStack(documentId)` returns a `Stack` with `roomName`, `databasePath`, `proxy`, `collaboration`, `restartCollaboration(downtimeMs)` and `stop()`.
- `openAuthors({ browser, target, authors, seedDocx })` opens the first author with `create` and the rest with `join`.
- `typeInParagraph({ page, paragraphOwner, text, delayMs })` verifies editor focus before every keystroke and records each recovery in `focusRecoveries`.
- `expectConverged({ pages, isComplete })` polls until every client has identical text and `isComplete` holds.
- `reachesLength({ page, typed })` builds an `isComplete` from the current length plus the typed characters.
- `readServerViews(stack)` returns live and replayed text, live and replayed state vectors, and the projected events.
- `insertedTextBy`, `deletedTextBy`, `insertedTextIn` read an author's attributed text from events.
- `expectEveryCharacterAccounted({ events, initialLength, finalLength })` asserts the length invariant.
- `seedFor(authors)` builds a DOCX with one `Paragraph owned by <author>.` per author.

## Chaos
- `ChaosProxy` sits between browsers and the server: `setConditions({ userKey, conditions: { latencyMs, jitterMs } })` per user, `cut(userKey)` and `heal(userKey)`. (poc/server/chaos-proxy.ts)
- `ServerProcess` (poc/tests/server-process.ts) runs the server out of process so `kill('SIGKILL')` can crash it.

## Universal invariant
Every E2E asserts: all clients converge, server text equals client text, replay equals live (state vector), and `sum(inserted) - sum(deleted) == final length - initial length`. (poc/TEST-PLAN.md)

## Conventions
- Test names are in present tense and never start with "should". (project convention)
- No `sleep`; wait on conditions with `expect.poll`, `toPass` or `waitForFunction`. (project convention, poc/tests/harness.ts)
- Under concurrency, judge completion by length, never by marker order, because the caret can land out of order. (poc/RESULTS.md, `reachesLength` in poc/tests/harness.ts)
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
