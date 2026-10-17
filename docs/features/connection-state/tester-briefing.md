# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## G4: end-to-end infrastructure (Steps 18 and 19)

### What changed

- `e2e/restartable-stack.ts` (new): seeds a fresh database directory, starts the built server on port 3150 and exposes `startRestartableStack`, `stopServer`, `startServer` and `stopRestartableStack`. `stopServer` sends SIGTERM, waits for exit, and sends SIGKILL after a 10 s grace period.
- `e2e/stack.ts`: now owns `assertPortFree`, moved from `scenario-stack.ts`. Message and behaviour unchanged.
- `e2e/scenario-stack.ts`: imports `assertPortFree` from `stack.ts`.
- `e2e/fixtures.ts`: `signedInContext` and `openedContext` take an optional `origin`, passed as `baseURL` only when given. Passing `baseURL: undefined` would override the config's base URL and break every existing caller, so it is spread conditionally.
- `e2e/connection-state.spec.ts` (new): serial file; only the restart health test exists. Tests 20 to 24 are added after G3 merges.

### Fake model

The restartable server reuses the fake OpenRouter that Playwright's `webServer` starts on port 3199 (`FAKE_OPENROUTER_ORIGIN`). It starts none of its own, so it only works under `playwright test`, and `apps/server/dist` and `apps/web/dist` come from the same `webServer` build step.

### How to run

```bash
pnpm test:e2e -- connection-state
pnpm test:e2e -- documents auth
```

Port 3150 must be free; the stack refuses to start otherwise.

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `e2e/connection-state.spec.ts::the restartable server answers health after a stop and a start` | `Error: Cannot find module './restartable-stack'` (commit 70122d1) | the stack module exists (commit c35f612); the test took 834 ms, 9.8 s for the whole run including the web server boot |

### Hypotheses to attack

1. Hypothesis: SIGTERM stops the server within the grace period, so SIGKILL never fires. Break it by: open a collaboration socket from a page, call `stopServer`, and time it; a stop near 10 s means the graceful path hangs on open sockets.
2. Hypothesis: the restarted server keeps the same database, so documents and sessions survive. Break it by: sign in, restart, and reuse the cookie on the same origin.
3. Hypothesis: the optional `origin` leaves every existing caller unchanged. Break it by: run the whole suite; `documents` and `auth` ran green (21 tests) after the fix.

### Known gaps

- No test yet drives a browser against the restartable origin; that starts with Step 20.
- A spec that crashes before `afterAll` can leave a server on port 3150; the next run then fails at `assertPortFree` until the process is stopped.

### G4: red specs (Steps 20, 22, 23 and the width test)

All four fail today with the same text, because no banner exists yet. Commit ead556e. Each ran alone, since serial mode skips the rest after a failure.

| Test | Red text |
|------|----------|
| `a server restart shows lost, reconnecting, then clears` | `expect(locator).toHaveAttribute(expected) failed`, `Expected: "lost"`, `element(s) not found` after 30000ms |
| `an edit typed while the server is down reaches the other author after reconnect` | same; not a pin, since it waits for `lost` before typing |
| `the session cookie removed shows failed, an inert editor and a working Reload` | same |
| `the banner reads well at eight widths` | `expect(locator).toBeVisible() failed`, `element(s) not found` |

Notes for the tester and for the lead:
- The spec declares `RECOVERED_NOTICE_MS` and `MEMBERS_REFRESH_MS` locally: `RECOVERED_NOTICE_MS` waits on G1, and `editor-api.ts` cannot be imported from `e2e` because it uses the web `@/` alias. Swap the first for the `libs/types` export after G1 merges.
- The banner states are recorded with an in-page mutation observer, so transient states are caught. `reconnecting` may be skipped if the provider reconnects before reporting it, because the server restarts as soon as `lost` shows; if that happens, Step 21 decides whether the server should stay down longer.
- The width test checks the banner height against the computed line height of the banner element; if G3 sets a line height on a child only, adjust the measurement.
- Step 23 expects the Failed banner to carry the Reload button and the alert role together.
- Added Step 25 in the plan for the width test; lead to confirm.
- Helper waits moved to `stack.ts` (`waitForHealth`), `ensureServerRunning` restarts the server after any failed test so the next one starts clean, and `.claude/rules/e2e.md` lists port 3150.
