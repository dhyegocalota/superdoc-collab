# Test plan: Connection state

Every checkbox states the input and the exact expected outcome; a ticked box carries evidence after ` — evidence: `.

## The failing test first

- [ ] `libs/types/src/connection.test.ts` `the connection states are the five values the banner names` — input: `Object.values(ConnectionState)`; expected: `['online', 'lost', 'reconnecting', 'recovered', 'failed']`; before Step 2: the import fails with `Failed to load url ./connection`.

## Unit

Members route and the members flag:

- [ ] `apps/server/src/documents/documents-routes.test.ts` `members reports whether the current user is online` — input: owner with a live socket, reader with none, both request members; expected: owner `isCurrentUserOnline` true, reader `false`.
- [ ] `apps/web/src/features/editor/use-members.test.ts` `isCurrentUserOnline is null before the first answer` — input: pending request; expected: `null`.
- [ ] `use-members.test.ts` `isCurrentUserOnline follows the latest answer` — input: answers true, then false; expected: true, then false.
- [ ] Edge, error path: `use-members.test.ts` `isCurrentUserOnline is null after a failed poll` — input: true, then HTTP 500; expected: `null`, never true.

Tab identity and per-tab presence (G3a):

- [ ] `apps/web/src/lib/tab-id.test.ts` `the tab id is one uuid per page load` — input: import twice, `crypto.randomUUID` stubbed; expected: the same UUID both times, the stub called once.
- [ ] `collaboration-config.test.ts` `the socket URL carries the tab id` — input: the config for a document; expected: the URL's `tab` query equals `tabId`.
- [ ] `collaboration-runtime.test.ts` `onlineTabIds lists the tabs with a live connection in that room` — input: tabs A and B in one room, one in another, then A closes; expected: `{A, B}`, then `{B}`.
- [ ] `collaboration-server.test.ts` `onAuthenticate stores the tab from the upgrade URL in the connection context` — input: upgrade URL with `tab=A`; expected: context `tab` is `A`.
- [ ] `documents-routes.test.ts` `members with a tab query reports that tab, without it the user` — input: Ana connected with tab A only; request with `tab=A`, `tab=B`, no `tab`; expected: true, false, true.
- [ ] Edge, per-tab flag: `documents-routes.test.ts` `a second tab of the same user does not keep the first tab online` — input: Ana's tab A closes while tab B stays open; request with `tab=A`; expected: `isCurrentUserOnline` false.
- [ ] `use-members.test.ts` `the members request carries the tab id` — input: stubbed `fetch`; expected: the request URL's `tab` query equals `tabId`.
- [ ] `use-members.test.ts` `membersAnsweredAt is null before the first answer, then the time of the latest answer` — input: pending request, then an answer at a fake-timer instant; expected: `null`, then that instant.
- [ ] `use-members.test.ts` `membersAnsweredAt moves on a refetch` — input: two answers; expected: the second time is later than the first.
Exception narrowing (`superdoc-exceptions.test.ts`):

- [ ] `a warn diagnostic is logged, not failed` — input: `{ diagnosticCode: 'RENDER_ERROR', severity: 'warn', ... }`; expected: `ExceptionOutcome.Logged`.
- [ ] `an error diagnostic is fatal` — input: `diagnosticCode: 'PARSE_ERROR', severity: 'error'`; expected: `ExceptionOutcome.Fatal`.
- [ ] `edit-rejected is recoverable` — input: `{ code: 'edit-rejected' }`; expected: `ExceptionOutcome.Recoverable`.
- [ ] `each collaboration reason is a connection failure` — input: `collaborationReason` of `access-denied`, `connection-failed`, `sync-timeout`; expected: `ExceptionOutcome.ConnectionFailed` for each.
- [ ] `worker-transport-failed is a connection failure` — input: `{ code: 'worker-transport-failed' }`; expected: `ConnectionFailed`.
- [ ] `the three collaboration codes are no longer Fatal rows` — input: each `collaboration-*` code with its `collaborationReason`; expected: `ConnectionFailed` with that reason from `failureReasonOf`.
- [ ] `a payload without a code is fatal` — input: `{ error, editor: null }`; expected: `Fatal`.
- [ ] `failureReasonOf maps each reason and the worker code, Unknown otherwise` — input: each collaboration reason, the worker code, and `{ error, editor: null }`; expected: `AccessDenied`, `ConnectionFailed`, `SyncTimeout`, `WorkerTransportFailed`, then `Unknown`.

Version viewer (`version-viewer.test.tsx`):

- [ ] `a warn diagnostic calls neither onFailed nor onConnectionFailed` — input: warn diagnostic through the captured `onException`; expected: both mocks with zero calls.
- [ ] `a collaboration reason calls onConnectionFailed and not onFailed` — input: `collaborationReason: 'access-denied'`; expected: `onConnectionFailed` 1 call, `onFailed` 0.
- [ ] `a fatal payload calls onFailed` (a `pin`, green on arrival) — input: `{ error, editor: null }`; expected: `onFailed` 1 call.
- [ ] `edit-rejected calls neither` — input: `{ code: 'edit-rejected' }`; expected: `onFailed` and `onConnectionFailed` both with zero calls.

Merge table (`use-connection-state.test.ts`, `mergeConnectionState`):

- [ ] Failed rows — input: `Failed` with server `true`, `false`, `null`; expected: `Failed` in all three.
- [ ] Lost and Reconnecting with server `false` or `null` — input: `Lost` and `Reconnecting`, each with `false` and `null`; expected: the same state as the reading, four rows.
- [ ] Lost and Reconnecting with server `true` — input: `Lost` and `Reconnecting` with `true`; expected: `Recovered` in both.
- [ ] Clear rows — input: `Clear` with `true`, `false`, `null`; expected: `Online` in all three.

Callback mapping (`use-connection-state.test.ts`, `transportReportOf`, test.each):

- [ ] `{ state: 'degraded', kind: 'lost' }` — expected: reading Lost.
- [ ] `{ state: 'degraded', kind: 'reconnecting' }` — expected: reading Reconnecting.
- [ ] `{ state: 'failed', kind: 'reconnecting' }` — expected: reading Failed, because state failed wins.
- [ ] `{ state: 'failed', kind: 'failed' }` — expected: reading Failed, no reason.
- [ ] `{ kind: 'initial', state: 'synced' }` — expected: reading Clear plus `hasSynced`.
- [ ] `{ state: 'synced', kind: 'recovered' }` — expected: `null` reading (keeps the current one) plus `hasSynced`.

State machine (`use-connection-state.test.ts`, fake timers; spies carry `mockName`):

- [ ] `Lost, Reconnecting, Recovered, then Online after RECOVERED_NOTICE_MS` — input: lost, reconnecting, server `true`, then 2999 ms, then 1 ms; expected: Lost, Reconnecting, Recovered, Recovered at 2999 ms, Online at 3000 ms.
- [ ] `Failed is sticky until reset` — input: failed, then a Clear reading; expected: Failed.
- [ ] `two readings in one tick fold in arrival order` — input: lost then reconnecting in one act, then the reverse; expected: Reconnecting, then Lost.
- [ ] `reset returns to Online` — input: failed, then `resetConnection`; expected: Online and reading Clear.
- [ ] `a Lost during Recovered cancels the notice` — input: recovered, then lost with server `false`, advance 3500 ms; expected: Lost at 3500 ms.
- [ ] `a synced reading refetches members and changes nothing else` — input: `hasSynced` report while Online; expected: `invalidateQueries` called with `membersQueryKey`, state Online.
- [ ] `a recovered reading refetches members` — input: `kind: 'recovered'` report; expected: one `invalidateQueries` call on the members key.
- [ ] `the notice timer is cleared on unmount` — input: unmount during Recovered; expected: `vi.getTimerCount()` is 0.
- [ ] `a Lost reading records lostAt, cancels the members query and refetches` — input: a lost report; expected: one `cancelQueries` and one `invalidateQueries`, both on `membersQueryKey`.
- [ ] `flag true when Lost arrives stays Lost` — input: flag true with `membersAnsweredAt` before the Lost; expected: Lost.
- [ ] `an answer in flight at Lost is ignored` — input: an answer whose `membersAnsweredAt` is not after `lostAt`, then a later one; expected: Lost, then Recovered.
- [ ] `Reconnecting plus a recovered report plus flag null stays Reconnecting` — input: reconnecting, a `recovered` report, flag `null`; expected: Reconnecting.
- [ ] `the exception's reason beats Unknown from the callback in either arrival order` — input: a failed callback and a connection exception with `AccessDenied`, in both orders; expected: Failed with `AccessDenied` both times.

Banner (`connection-banner.test.tsx`):

- [ ] `each state renders its title` — input: Lost, Reconnecting, Recovered, Failed; expected: each title from `connection-copy.ts`, with `KEPT_AND_DATED_DETAIL` in Lost and Reconnecting.
- [ ] `Failed uses role alert and the others role status` — input: each state; expected: `alert` for Failed, `status` for the rest.
- [ ] Edge, Unknown reason — input: Failed with `Unknown`; expected: `FAILURE_REASON_COPY[Unknown]` on screen.
- [ ] Edge, Online — input: Online; expected: no element with `data-testid="connection-banner"`.
- [ ] `Reload calls onReload once` — input: click Reload in Failed; expected: `onReload` 1 call.

Page wiring (`document-page.test.tsx`):

- [ ] `a lost callback shows the banner above the version banner` — input: callback `{ state: 'degraded', kind: 'lost' }` while a past version is shown; expected: `data-state="lost"` precedes `version-banner` in document order.
- [ ] `a warn diagnostic keeps the editor usable and logs with console.warn` — input: warn diagnostic; expected: no `EDITOR_FAILED_MESSAGE`, no connection banner, `console.warn` called with the diagnostic message.
- [ ] `a failed callback makes the editor inert, dims it and names the reason` — input: `{ state: 'failed', kind: 'failed' }`; expected: `inert` on `document-editor`, `opacity-60` on the editor area, role `alert`.
- [ ] `Reload remounts the editor with a new SuperDoc instance` — input: click Reload in Failed; expected: two SuperDoc constructions, one destroy, no banner.
- [ ] `Reload after a Create open remounts with the refetched Join setup and the current file` — input: first open answers `RoomMode.Create`, the refetch answers `RoomMode.Join` with a newer file; expected: the second construction receives the Join setup and the newer file.
- [ ] `a callback from the first instance after Reload shows no banner` — input: Reload, then the first instance's captured lost callback fires; expected: no banner.
- [ ] Existing `an unrelated fatal exception still shows EDITOR_FAILED_MESSAGE` — input: `{ code: 'password-required' }`; expected: the message appears.

Static checks:

- [ ] Grep proves the old narrowing is gone — input: `rg -n "isRecoverableException|onException: onFailed" apps .claude`; expected: no output after Step 17, including the describe block and the `web-ui.md` line.

## E2E (Playwright specs)

- [ ] `e2e/connection-state.spec.ts` `a server restart shows lost, reconnecting, recovered, then clears` — steps: Ana and Bruno open a shared document on the restartable server, `stopServer`, wait until `lost` shows, then `startServer` at once; expected: `lost` visible, `reconnecting` observed, `recovered` observed, then no banner. Waits derive from the provider retry cap (30 s), `MEMBERS_REFRESH_MS` and `RECOVERED_NOTICE_MS`.
- [ ] `e2e/connection-state.spec.ts` `an edit typed while the server is down reaches the other author after reconnect` — steps: `stopServer`, Ana types `' <ANA-OFFLINE>'`, `startServer`; expected: Bruno's text contains the marker within a wait derived from the provider retry cap, and Ana's event `serverTime` is no earlier than the restart.
- [ ] `e2e/connection-state.spec.ts` `the session cookie removed shows failed, an inert editor and a working Reload` — steps: `clearCookies`, `stopServer`, `startServer`, sign in again on a second page in the same context, Reload on the first; expected: `failed` banner with role `alert` within a wait derived from the provider retry cap and `inert` on the editor; Reload is pressed only after health answers `200`; then no banner and editable text.
- [ ] `e2e/connection-state.spec.ts` `the banner and Reload fit at every width` — steps: load the failed state in a loop over 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 px; expected at each width: no horizontal page scroll, Reload inside the viewport, banner at most three line heights. One box per width:
  - [ ] 320 px — expected as above.
  - [ ] 375 px — expected as above.
  - [ ] 768 px — expected as above.
  - [ ] 1024 px — expected as above.
  - [ ] 1280 px — expected as above.
  - [ ] 1536 px — expected as above.
  - [ ] 1920 px — expected as above.
  - [ ] 2560 px — expected as above.
- [ ] `e2e/collaboration.spec.ts` `an edit rejected under a concurrent delete does not stop the editor` — steps: the existing spec; expected: still green with the warn narrowing and the status line.

## Prove it for real — Playwright MCP

- [ ] Happy path, entry to exit: two authors on the local stack, edit access; restart the server; expected: lost, then reconnecting, then the banner clears; the editor never shows `EDITOR_FAILED_MESSAGE`.
- [ ] Empty: open a document while online; expected: no connection banner, no layout shift.
- [ ] Single: one restart; expected: exactly one banner at a time, no stacking.
- [ ] Many: three restart cycles; expected: no more than one banner, the notice clears each time.
- [ ] Rejected input: a warn diagnostic in the page; expected: no banner, editor editable, `console.warn` with the message.
- [ ] Browser Back mid-flow: press Back while Failed; expected: the documents list loads with no error and no banner on a fresh visit.
- [ ] Reload mid-flow: reload the browser tab during Reconnecting, only after health answers; expected: the document reopens, no banner until the next callback.
- [ ] Per-tab flag: Ana opens the document in tab A and tab B; block tab A's socket (Playwright `routeWebSocket`) while tab B stays connected; expected: tab A stays Reconnecting and never shows Recovered while tab B keeps the user online on the server.
- [ ] Two authors in two contexts at once: Ana restarts, Bruno watches; expected: Bruno sees the same banner sequence within one poll interval.
- [ ] Latency and disconnect: restart with the members route answering 500 (Playwright route); expected: Reconnecting stays, Recovered never shows, the banner clears only after the poll succeeds.
- [ ] Console and network clean: zero console errors and zero failed requests, other than the failures the restart causes: the refused socket, and the members, timeline, summaries and session requests that fail while the server is down, in the restart and cookie tests.
- [ ] Screenshots of every state (Lost, Reconnecting, Recovered, Failed) at each of the eight widths, light and dark, saved under `.pr-media/connection-state/`, named by state, width and theme. At every width: no horizontal page scroll, banner at most three lines on phones, Reload fully visible, no layout jump on load or theme switch.
- [ ] 320 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; on phones at most three lines. Screenshots at `.pr-media/connection-state/`.
- [ ] 375 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; as at 320 px. Screenshots at `.pr-media/connection-state/`.
- [ ] 768 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; banner on one or two lines. Screenshots at `.pr-media/connection-state/`.
- [ ] 1024 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; editor area full width under the banner. Screenshots at `.pr-media/connection-state/`.
- [ ] 1280 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; as at 320 px. Screenshots at `.pr-media/connection-state/`.
- [ ] 1536 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; as at 320 px. Screenshots at `.pr-media/connection-state/`.
- [ ] 1920 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; as at 320 px. Screenshots at `.pr-media/connection-state/`.
- [ ] 2560 px, all four states, light and dark: expected: no horizontal page scroll, Reload fully visible, no layout jump; banner text not stretched past the editor width. Screenshots at `.pr-media/connection-state/`.
- [ ] With a past version shown at 1280 px: expected: the connection banner sits above the version banner and both are full width.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: Recovered shows only when the server confirms — attack: block the members route during the restart; expected: the banner stays Reconnecting, never Recovered; result: refuted | held.
- [ ] Claim 2: Reload leaves exactly one live collaboration socket — attack: press Reload three times while watching `page.on('websocket')`; expected: one open socket after each Reload; result: refuted | held.
- [ ] Claim 3: a warn diagnostic never fails the editor — attack: in a `document-page.test.tsx` page test, call the captured config's `onException` with a warn diagnostic while a remote edit callback is scripted; the E2E does not raise one; expected: no failed banner, no `EDITOR_FAILED_MESSAGE`, the editor stays editable; result: refuted | held.

## Coverage honesty

- A real `worker-transport-failed` cannot be produced locally. Only the payload narrowing is unit-tested, with the code as a literal.
- The E2E refuses reconnects with a removed cookie. The close code the browser sees may differ from the 4401 the spec names; the recorded callback sequence is the evidence.
- Unsynced edits at Reload (design row 7.25) are not tested. The Failed copy says they are lost on reload and suggests downloading first (`UNSYNCED_LOST_ON_RELOAD_DETAIL`).
- A client-side network drop is not reproduced. Recovered may show while the server still holds the socket, as the spec accepts.
- Outages longer than the provider's retry budget are not tested.
- The three-second notice timing is proven with fake timers; the E2E checks that `recovered` is observed and then gone, with waits derived from the notice time.
- A warn diagnostic cannot be raised in the E2E; it is scripted through the captured config in a page test.
- The Playwright loop covers the failed state at the eight widths; the other states at the eight widths are covered by the MCP walk screenshots, not by assertions.
