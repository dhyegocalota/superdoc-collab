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
- G1: the per-user flag is exercised only through unit tests here; the browser walk and the E2E restart prove it end to end.

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

## G3a: per-tab presence and the members answer time (developer-3a)

### What changed

- `apps/web/src/lib/tab-id.ts`: `tabId()` returns one `crypto.randomUUID()` per page load.
- `libs/types/src/routes.ts`: `TAB_QUERY_KEY = 'tab'` and `isTabId`, a UUID check.
- `apps/web/src/features/editor/collaboration-config.ts`: `collaborationUrl` appends `?tab=<tabId>`. The version viewer shares it, so its socket carries the tab too; `superdoc-options.test.ts` and `version-view-page.test.tsx` expect the new URL.
- `apps/server/src/collaboration/collaboration-server.ts`: the connection context gains `tabId: string | null`, read from `requestParameters` and stored only when `isTabId` accepts it, else `null`.
- `apps/server/src/collaboration/collaboration-runtime.ts`: `onlineTabIds({ documentId, userId })` beside `onlineUserIds`; it counts only that user's connections.
- `apps/server/src/documents/documents-routes.ts`: with a valid `tab` query the members route answers `isCurrentUserOnline` from `onlineTabIds`; without it, the per-user answer.
- `apps/web/src/features/editor/editor-api.ts`: `fetchMembers` sends `tab=<tabId>`.
- `apps/web/src/features/editor/use-members.ts`: return shape is `{ members, isUnavailable, isCurrentUserOnline: boolean | null, membersAnsweredAt: number | null }`. `membersAnsweredAt` is TanStack's `dataUpdatedAt`, `null` before the first answer and after a failed poll.

### Red today, green after

| Test (red, green) | Red text printed | Green when |
|---|---|---|
| `tab-id.test.ts::tabId returns the same id within a page load` (dec8e69, aae89a5) | `Error: tabId is not implemented` | one id per page load |
| `collaboration-config.test.ts::the collaboration URL carries the tab id as the tab query` (50f30ad, 24ebf29) | `AssertionError: expected null to be '<uuid>'` | the URL has `tab` |
| `collaboration-server.test.ts::a connection's tab id is in the room's online tab ids and leaves with the socket` (a742683, 3190979) | `Error: onlineTabIds is not implemented` | the context stores the tab |
| `documents-routes.test.ts::members answers isCurrentUserOnline for the tab that asks, not for another tab of the same user` (7ba3a71, a26d1b8) | `AssertionError: expected true to be false` | the route answers per tab |
| `use-members.test.ts::membersAnsweredAt is null before the first answer and the answer time afterwards` (ca4bccd, cef4b7d) | `AssertionError: expected null not to be null` | `dataUpdatedAt` is exposed |
| `use-members.test.ts::the members request carries the tab id` | `AssertionError: expected null to be '<uuid>'` | `fetchMembers` sends `tab` |
| `use-members.test.ts::membersAnsweredAt is null after a failed poll` | `AssertionError: expected null not to be null`, on the wait before the failed poll | `error` set gives `null` |

| `documents-routes.test.ts::a socket of another user carrying a tab id does not make that tab online for the asking user` (07359ba, e31686d) | `expected [ true, true ] to deeply equal [ false, true ]` | `onlineTabIds` is scoped by user |
| `routes.test.ts::isTabId accepts only a UUID` (27ab715, green after) | `Error: isTabId is not implemented` | UUID pattern |
| `collaboration-server.test.ts::a $name tab query is not stored` | `expected Set{ '' } to deeply equal Set{}` | `onAuthenticate` validates |
| `documents-routes.test.ts::members treats a $name tab as absent and answers per user` | `expected false to be true` | the route validates |

The 16 KB case lives in the `isTabId` unit test; the socket and route tests use 1 KB because Node limits request headers to about 16 KB.

The red commit ca4bccd adds `membersAnsweredAt: null` as a stub so typecheck stays green.

### Hypotheses to attack

1. Hypothesis: with two tabs of one user open, closing or losing the socket of one tab turns only that tab's flag to `false`. Break it by: opening the same document in two tabs, killing one tab's socket, and reading each tab's members answer.
2. Hypothesis: a members request without `tab` keeps the per-user answer for other callers. Break it by: requesting members with no query while any socket of the user is open.
3. Hypothesis: a connection without a `tab` query (agent path, old client) never appears in `onlineTabIds`. Break it by: connecting an agent and reading the members answer for any tab.
4. Hypothesis: user B cannot keep user A's tab online by sending A's tab id. Break it by: connecting as B with `?tab=<A's id>` and asking as A.
5. Hypothesis: a malformed or oversized `tab` never reaches the connection context or the route lookup. Break it by: sending empty, long and non-UUID values on both.
6. Hypothesis: `membersAnsweredAt` advances on every successful poll even when the body is unchanged. Break it by: watching it across two polls with identical members.

### Known gaps

- The lead authorized three one-line edits outside my list: `editor-api.ts`, `superdoc-options.test.ts`, `version-view-page.test.tsx`.
- `document-page.test.tsx` (G3b's file) matches the members path exactly and fails on `?tab=`; reported to the lead, not edited here.
- `onlineTabIds` ignores every tab of a connection that has no `tab` query, so a client that omits it reads `false` when it asks with a tab.

### G4: runs against the merged banner

Run on the integration branch merged into the lane, ports 3100, 3199 and 3150 free. Do not run two gates at once: they share those ports, and a second run silently talks to the first run's server.

| Test | Result | Output |
|------|--------|--------|
| `the restartable server answers health after a stop and a start` | green, 1.0 s | |
| `a server restart shows lost, reconnecting, then clears` | green, 8.6 s | observed order lost, reconnecting, recovered, then the banner cleared |
| `an edit typed while the server is down reaches the other author after reconnect` | green, 7.2 s | |
| `the session cookie removed shows failed, an inert editor and a working Reload` | green, 6.6 s | |
| `the banner reads well at eight widths` | red | `banner content height at 320px`, `Expected: <= 60`, `Received: 168` |

- The transient `lost` is never polled alone: the spec waits for `lost` or `reconnecting`, and the order comes from the in-page observer.
- The edit test compares the marker event's `serverTime` with the moment just before `startServer` is called, because health answers up to a poll interval after the new server accepted the edit. The old server was down at that moment, so the new one recorded the edit.
- With the cookie cleared, Failed shows as soon as the server stops, so that test no longer waits for `lost`.
- The width test is red for a real reason. Lost and Reconnecting fit at all eight widths. Failed at 320 px reads as three paragraphs plus Reload, 168 px of content against 60 px for three lines, and the design asks for three lines at most on phones. Reload sits inside the viewport. 375 px probably fails the same way and was not reached.
- The banner's vertical padding and borders are excluded from the measured height.

- Width rule, decided by the lead: text lines on the text block only, at most 3 on phones for Lost, Reconnecting and Recovered, at most 5 for Failed; Reload must stay inside the viewport. The test measures every width in both phases and asserts once, so a run lists every failing width. It was not rerun after this change.
- A 401 on the Reload refetch is a known gap: `refetchQueries` does not throw, so the page ends on the unavailable notice or the old data instead of a sign-in prompt.
- Review fixes: Reload refetches the open key and the current file key with `exact: true`; the failure reason survives late Lost or Reconnecting reports; a stale Recovered action is ignored unless the reading is Lost or Reconnecting; the members cancel and refetch run inside `reportTransport` for outage reports; the banner shows the reason and the unsynced warning in one paragraph; the Reload button is disabled and reads "Reloading…" while the refetch runs.
- Review-fix red/green pairs: hook `058ac98`/`0b1027e`, banner `133e011`/`a4a3a58`, page `f3deef0`/`68b73e4`.

- Restart test, renamed `a server restart shows reconnecting, recovered, then clears`: the tester never saw `lost`, because the provider reports lost and reconnecting in the same tick. The test requires `reconnecting` then `recovered` in order, and `lost` only as an optional entry before `reconnecting`. Not rerun after this change.
### G3b: tester defect fixes
- Failed copy shortened and pinned by length in `connection-copy.test.ts` (red `fb2be35`, green `d57cf17`).
- Reload with the server down keeps the page, the Failed banner and an enabled button, and shows `RELOAD_FAILED_MESSAGE` (red `5ef11d9`, green in the commit after it). A failed open refetch no longer replaces a page that already has its data.
- A 401 raises `AuthenticationError` and `pollWhileAvailable` stops (red `16ce466`, green `de14172`).
- Superseded: a session-ended reason. The repository holds no recorded callback `detail` for a removed cookie, the E2E spec does not record payloads, and the SuperDoc worker code is minified, so nothing distinctive could be read without running the E2E. The reason stays Unknown.
- Session-ended reason (supersedes the gap above): the transport sends `detail: null` and no exception for a removed cookie, so the app derives `ConnectionFailureReason.SessionEnded` from a 401 on the members poll (`useMembers.isSessionEnded`, `resolveFailureReason`). The banner then reads "Your session ended. Sign in again." and its button reads "Sign in" and navigates to the sign-in route with `next` and the signed-out state, which clears the cached session. Pairs: members `450fc82`/`f84654a`, hook `dd182c7`/`35d4019`, banner `ad5dbce`/`55ac7ec`, page `55efdfa`/the commit after it. Hypothesis to attack: with the cookie removed, the E2E now shows the Sign in button and, after signing in, lands back on the document. Known gap: a 401 that arrives only after a Failed with a specific reason (access denied) keeps that reason.
- Second review fixes: a failed Reload no longer shows the file load error beside the inert editor (`f10b519`/`5c783c9`); a Failed report refetches members (`d218d72`/`a996f7f`); copy pins on the combined reason and warning and a sign-in warning for an ended session (`db384b3`/`5ecaf53`); the banner prop is `onAction` and its warning follows the button (`ff29676`/`1ac9c15`, `07f6bb1`); `signInPathFor` shared by the session guard and the page (`8784ec0`/`d283caf`). The red commit `ff29676` leaves typecheck red until `1ac9c15`.
- Sign in after an ended session lost `next`: the signed-out landing in `RedirectIfSession` navigated to the path without its query. Red `d6ca58c` then `461ea7c` (`expected '' to be '?next=%2Fadmin'`), green in the commit after.
- Shared browser: the signed-out landing now removes inactive cached queries before nulling the session, so the next user does not see the previous user's documents list. Red `0279e03` (`expected [ { id: 'doc-1' } ] to be undefined`), green in the next commit. Known gap: active queries on the landing page are not removed.
