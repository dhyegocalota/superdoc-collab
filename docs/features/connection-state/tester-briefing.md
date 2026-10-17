# Tester briefing: connection state

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## G1: types and the members flag (developer-1)

### What changed

- `libs/types/src/connection.ts`: `ConnectionState` and `ConnectionFailureReason` enums, exported from `index.ts`.
- `libs/types/src/constants.ts`: `RECOVERED_NOTICE_MS` (3 s).
- `libs/types/src/documents.ts`: `DocumentMembers` gains `isCurrentUserOnline: boolean`.
- `apps/server/src/documents/documents-routes.ts`: the members route answers `isCurrentUserOnline` for the caller from `runtime.onlineUserIds`.
- `apps/web/src/features/editor/use-members.ts`: returns `isCurrentUserOnline: boolean | null`, `null` without data or with a poll error.
- `.claude/rules/collaboration.md`: one line on the members flag.
- No web test fixture needed a change for the new field.

### How to run

```bash
pnpm --filter @superdoc-collab/types test:unit -- connection
pnpm --filter @superdoc-collab/server test:unit -- documents-routes
pnpm --filter @superdoc-collab/web test:unit -- use-members
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types/src/connection.test.ts::the connection states are the five values the banner names` (red 3346bdb, green b348737) | `Cannot find module './connection' imported from .../connection.test.ts` | the enum exists with five values |
| `apps/server/src/documents/documents-routes.test.ts::members reports whether the current user is online` (red 30896c7, green 9ba8514) | `AssertionError: expected [ undefined, undefined ] to deeply equal [ true, false ]` | the route adds the caller's flag |
| `apps/web/src/features/editor/use-members.test.ts::isCurrentUserOnline is null before the first answer` (red da3b144, green 1f86eff) | `AssertionError: expected undefined to be null` | the hook returns `null` without data |
| `use-members.test.ts::isCurrentUserOnline follows the latest answer` | `AssertionError: expected undefined to be true` | the hook returns the data flag |
| `use-members.test.ts::isCurrentUserOnline is null after a failed poll` | `AssertionError: expected undefined to be true`, on the first wait, before the 500 | `error` set gives `null` |

The red commit da3b144 leaves the web typecheck red: no stub, because the hook has no such field yet.

### Hypotheses to attack

1. Hypothesis: the flag reflects the server's socket for the caller, not the browser's belief. Break it by: restarting the server while a user is connected and reading the members response before the socket returns.
2. Hypothesis: a reader with no collaboration socket gets `false`, never a missing field. Break it by: requesting members as that reader.
3. Hypothesis: after a failed poll the hook never reports a stale `true`. Break it by: making the members endpoint fail once while connected and watching the value go `null` until the next good answer.
4. Hypothesis: the `final-visuals` lane's edits to `use-members.ts` merge cleanly because fields were only added. Break it by: merging both lanes and running the web unit tests.

### Known gaps

- The failed-poll test drives the refetch with `invalidateQueries`, not the 5 s interval, so the polling cadence is not covered here.
- Any members poll error yields `null`, including the unavailable case; `isUnavailable` is unchanged.
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
## G2: exception outcomes and the version viewer

### What changed
- `apps/web/src/features/editor/superdoc-exceptions.ts` — `ExceptionOutcome`, `exceptionOutcome` and `failureReasonOf`; `isRecoverableException` is kept for G3 to remove.
- `apps/web/src/features/versions/version-viewer.tsx` — `onException` goes through `exceptionOutcome`; the local enum is now `ViewerConnectionState`.
- `.claude/rules/collaboration.md` — one bullet on exception narrowing.
- `libs/types/src/connection.ts` — only `ConnectionFailureReason`, mirrored from G1 so this lane typechecks; the lead keeps G1's file on merge.

### How to run
```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/superdoc-exceptions src/features/versions
pnpm typecheck
```

### Red today, green after
| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `superdoc-exceptions.test.ts::exceptionOutcome` and `failureReasonOf` rows | `Error: exceptionOutcome is not implemented` (stub) | the classifier is implemented |
| `version-viewer.test.tsx::a warn diagnostic calls neither onFailed nor onConnectionFailed` | `expected "vi.fn()" to be called +0 times, but got 1 times` | warn is Logged |
| `version-viewer.test.tsx::a collaboration reason calls onConnectionFailed and not onFailed` | `expected "vi.fn()" to be called 1 times, but got 0 times` | ConnectionFailed calls the connection handler |
| `version-viewer.test.tsx::edit-rejected calls neither` | `expected "vi.fn()" to be called +0 times, but got 1 times` | Recoverable does nothing |

`version-viewer.test.tsx::a fatal payload calls onFailed` is a pin: it was green before the change.

### Hypotheses to attack
1. Hypothesis: a warn diagnostic in a version view no longer ends time travel. Break it by: opening a version of a document that raises a warn diagnostic and checking the frame stays up.
2. Hypothesis: a collaboration refusal in a version view shows the connection-failed message, not the generic failure. Break it by: opening a version URL with the session cookie removed.
3. Hypothesis: any payload with neither a warn severity, `edit-rejected`, a collaboration reason nor the worker code is Fatal. Break it by: feeding `password-required` and an error diagnostic.

### Known gaps
- The raw string `'warn'` and the collaboration reason keys are matched as strings because the installed types are unions of literals; no run against a live SuperDoc was made.
- `worker-transport-failed` is not in the installed type definitions; it is read as a string.
- Test runs of the whole web suite were slow because of the shared heavy-command lock.

## G3b: connection hook, banner, page and Reload (`developer-3b`)

### What changed
- `apps/web/src/features/editor/use-connection-state.ts` — `TransportReading`, `TransportReport`, `transportReportOf`, `mergeConnectionState` and `useConnectionState({ documentId, isCurrentUserOnline, membersAnsweredAt })` returning `{ state, failureReason, reportTransport, resetConnection }`. A reducer holds reading, failure reason, loss time and the Recovered notice flag.
- `apps/web/src/features/editor/connection-banner.tsx` and `connection-copy.ts` — the banner for Lost, Reconnecting, Recovered and Failed; nothing when Online. Reload shows in Failed only.
- `apps/web/src/features/editor/superdoc-editor.tsx` — `onTransportReport`, callbacks behind an `isActive` flag, exceptions dispatched from a record keyed by `ExceptionOutcome`.
- `apps/web/src/features/editor/document-page.tsx` and `use-editor-setup.ts` — `editorGeneration` as the editor `key` and a `useEditorSetup` input; the banner above the version banner; inert and `opacity-60` when Failed; Reload awaits the refetch of the open query and of that document's file query, resets the connection, then bumps the generation.
- `apps/web/src/features/editor/superdoc-exceptions.ts` and its test — `isRecoverableException` and its describe block are gone; `exceptionOutcome` compares the code itself.
- `apps/web/src/features/editor/use-members.ts` — `membersAnsweredAt` only, mirrored from G3a; the lead keeps G3a's version.
- `.claude/rules/collaboration.md` and `.claude/rules/web-ui.md` — states, Reload and the banner pattern.

### How to run
```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/use-connection-state.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/connection-banner.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/document-page.test.tsx
pnpm typecheck
```

### Red today, green after (failure text each red run printed)
| Test file | Red commit | Printed | Green commit |
|-----------|------------|---------|--------------|
| `use-connection-state.test.ts` (34 tests) | `5aaed20` | `Error: mergeConnectionState is not implemented`, `transportReportOf is not implemented`, `useConnectionState is not implemented` | `659b25d` |
| `connection-banner.test.tsx` (15 tests) | `e50b917` | `Error: ConnectionBanner is not implemented` | `1864c4d` |
| `document-page.test.tsx` (6 new tests) | `3125aaf` | `TypeError: ...onCollaborationConnectionChange is not a function`; `expected "warn" to be called with arguments: [ 'render hiccup' ]`; a `toHaveTextContent` failure for the exception reason | `60f140c` |

No test in this lane is a pin.

### Hypotheses to attack
1. Hypothesis: a Lost reading with the server flag still true never shows Recovered until a members answer that finished after the loss. Break it by: stopping the server and watching the banner while the poll still has an old true.
2. Hypothesis: Failed never clears by itself, whatever the poll or the callback say. Break it by: removing the session cookie, then letting the poll and a `synced` callback run.
3. Hypothesis: Reload remounts one new SuperDoc instance with the refetched room mode and current file, and late callbacks from the old instance show nothing. Break it by: pressing Reload twice quickly, and by pressing it while the server is still down.
4. Hypothesis: the banner reads well from 320 to 2560 px with at most three lines on phones. Break it by: the Failed banner at 320 px, where the title, reason and unsynced detail may exceed three lines.
5. Hypothesis: a warn diagnostic only logs. Break it by: a real remote edit that raises a warn diagnostic.

### Known gaps
- The three-line limit at 320 px for the Failed banner was not measured; I have no browser.
- Reload with the server down: if the open query fails, the page shows the unavailable notice instead of the banner. I did not change that path.
- Reload refetches the stored file in create mode; in join mode the cached blank is refetched. No new request is added for a Join answer.
- The Reconnecting spinner and `motion-reduce` are untested in a browser.
- A 401 on the Reload refetch is a known gap: `refetchQueries` does not throw, so the page ends on the unavailable notice or the old data instead of a sign-in prompt.
- Review fixes: Reload refetches the open key and the current file key with `exact: true`; the failure reason survives late Lost or Reconnecting reports; a stale Recovered action is ignored unless the reading is Lost or Reconnecting; the members cancel and refetch run inside `reportTransport` for outage reports; the banner shows the reason and the unsynced warning in one paragraph; the Reload button is disabled and reads "Reloading…" while the refetch runs.
- Review-fix red/green pairs: hook `058ac98`/`0b1027e`, banner `133e011`/`a4a3a58`, page `f3deef0`/`68b73e4`.
