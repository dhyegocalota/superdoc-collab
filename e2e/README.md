# E2E

Playwright specs that drive the built app in headless Chromium from the user's side. [`playwright.config.ts`](../playwright.config.ts) builds the web app and the server, seeds the demo users into a fresh temporary `DATABASE_DIR`, starts the server on port 3100 and starts a fake OpenRouter ([`fake-openrouter.ts`](fake-openrouter.ts)) so no test calls a real model.

## Commands

| Command | Does |
|---|---|
| `pnpm test:e2e` | builds, starts the stack and runs every spec; needs `pnpm exec playwright install chromium` once |
| `pnpm test:e2e e2e/timeline.spec.ts` | one spec |
| `pnpm typecheck:e2e` | `tsc -p e2e --noEmit`; part of `pnpm typecheck` |

CI runs the suite only on manual dispatch (`gh workflow run e2e.yml --ref <branch>`), before a merge ([ADR 0018](../docs/adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md)).

## Specs

| Spec | Covers |
|---|---|
| [`auth.spec.ts`](auth.spec.ts) | sign-up, sign-in, sign-out, the redirect back, rate limiting, narrow width |
| [`documents.spec.ts`](documents.spec.ts) | upload, readers, share links, rename, delete, download, narrow width |
| [`collaboration.spec.ts`](collaboration.spec.ts) | two authors converge, every character is attributed to its author, identities are declared from awareness |
| [`timeline.spec.ts`](timeline.spec.ts) | topic bands, refresh, filters, live bands, keyboard, narrow width |
| [`topics-on-open.spec.ts`](topics-on-open.spec.ts) | topics named for a document opened right after upload |
| [`time-travel.spec.ts`](time-travel.spec.ts) | versions from the chart, shared `at` links, local highlights, readers, Escape |
| [`selection-summary.spec.ts`](selection-summary.spec.ts) | summaries by person, the shared cache, staleness and failures |

## Helpers

| File | Holds |
|---|---|
| [`fixtures.ts`](fixtures.ts) | the extended `test` (a distinct client address per test, contexts closed after it), sign-in and signed-in contexts |
| [`editor.ts`](editor.ts) | uploading the seed, typing in a paragraph, share links, reading edit events and the character-accounting invariant |
| [`timeline.ts`](timeline.ts) | bands, filters, the version frame, summaries and waits on the projection |

Conventions for every spec are in [`.claude/rules/testing.md`](../.claude/rules/testing.md): no `sleep`, wait on conditions, present-tense names.
