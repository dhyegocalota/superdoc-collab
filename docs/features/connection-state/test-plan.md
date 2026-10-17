# Test plan: Connection state

Every checkbox states the input and the exact expected outcome; a ticked box carries evidence after ` — evidence: `.

## The failing test first

- [ ] `libs/types/src/connection.test.ts` `the connection states are the five values the banner names` — input: `Object.values(ConnectionState)`; expected: `['online', 'lost', 'reconnecting', 'recovered', 'failed']`; before Step 2: the import fails with `Failed to load url ./connection`.
- [ ] Confirmed it fails for the right reason: the red text in plan Steps 1, 3, 5, 7, 9, 11, 14, 16 and 18 names a missing module, function or missing element, never a broken assertion on existing behaviour.

## Unit

Members route and the members flag:

- [ ] `apps/server/src/documents/documents-routes.test.ts` `members reports whether the current user is online` — input: owner with a live socket, reader with none, both request members; expected: owner `isCurrentUserOnline` true, reader `false`.
- [ ] `apps/web/src/features/editor/use-members.test.ts` `isCurrentUserOnline is null before the first answer` — input: pending request; expected: `null`.
- [ ] `use-members.test.ts` `isCurrentUserOnline follows the latest answer` — input: answers true, then false; expected: true, then false.
- [ ] Edge, error path: `use-members.test.ts` `isCurrentUserOnline is null after a failed poll` — input: true, then HTTP 500; expected: `null`, never true.

Exception narrowing (`superdoc-exceptions.test.ts`):

- [ ] `a warn diagnostic is logged, not failed` — input: `{ diagnosticCode: 'RENDER_ERROR', severity: 'warn', ... }`; expected: `ExceptionOutcome.Logged`.
- [ ] `an error diagnostic is fatal` — input: `diagnosticCode: 'PARSE_ERROR', severity: 'error'`; expected: `ExceptionOutcome.Fatal`.
- [ ] `edit-rejected is recoverable` — input: `{ code: 'edit-rejected' }`; expected: `ExceptionOutcome.Recoverable`.
- [ ] `each collaboration reason is a connection failure` — input: `collaborationReason` of `access-denied`, `connection-failed`, `sync-timeout`; expected: `ExceptionOutcome.ConnectionFailed` for each.
- [ ] `worker-transport-failed is a connection failure` — input: `{ code: 'worker-transport-failed' }`; expected: `ConnectionFailed`.
- [ ] `a payload without a code is fatal` — input: `{ error, editor: null }`; expected: `Fatal`.
- [ ] `failureReasonOf maps each reason and the worker code, Unknown otherwise` — input: each collaboration reason, the worker code, and `{ error, editor: null }`; expected: `AccessDenied`, `ConnectionFailed`, `SyncTimeout`, `WorkerTransportFailed`, then `Unknown`.

Version viewer (`version-viewer.test.tsx`):

- [ ] `a warn diagnostic calls neither onFailed nor onConnectionFailed` — input: warn diagnostic through the captured `onException`; expected: both mocks with zero calls.
- [ ] `a collaboration reason calls onConnectionFailed and not onFailed` — input: `collaborationReason: 'access-denied'`; expected: `onConnectionFailed` 1 call, `onFailed` 0.
- [ ] `a fatal payload calls onFailed` — input: `{ error, editor: null }`; expected: `onFailed` 1 call.

Merge table (`use-connection-state.test.ts`, `mergeConnectionState`):

- [ ] Failed rows — input: `Failed` with server `true`, `false`, `null`; expected: `Failed` in all three.
- [ ] Lost and Reconnecting with server `false` or `null` — input: `Lost` and `Reconnecting`, each with `false` and `null`; expected: the same state as the reading, four rows.
- [ ] Lost and Reconnecting with server `true` — input: `Lost` and `Reconnecting` with `true`; expected: `Recovered` in both.
- [ ] Clear rows — input: `Clear` with `true`, `false`, `null`; expected: `Online` in all three.

State machine (`use-connection-state.test.ts`, fake timers):

- [ ] `Lost, Reconnecting, Recovered, then Online after RECOVERED_NOTICE_MS` — input: lost, reconnecting, server `true`, then 2999 ms, then 1 ms; expected: Lost, Reconnecting, Recovered, Recovered at 2999 ms, Online at 3000 ms.
- [ ] `Failed is sticky until reset` — input: failed, then a Clear reading; expected: Failed.
- [ ] `two readings in one tick fold in arrival order` — input: lost then reconnecting in one act, then the reverse; expected: Reconnecting, then Lost.
- [ ] `reset returns to Online` — input: failed, then `resetConnection`; expected: Online and reading Clear.
- [ ] `a Lost during Recovered cancels the notice` — input: recovered, then lost with server `false`, advance 3500 ms; expected: Lost at 3500 ms.
- [ ] `a synced reading refetches members and changes nothing else` — input: `hasSynced` report while Online; expected: `invalidateQueries` called with `membersQueryKey`, state Online.
- [ ] `a recovered reading refetches members` — input: `kind: 'recovered'` report; expected: one `invalidateQueries` call on the members key.
- [ ] `the notice timer is cleared on unmount` — input: unmount during Recovered; expected: `vi.getTimerCount()` is 0.

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
- [ ] Existing `an unrelated fatal exception still shows EDITOR_FAILED_MESSAGE` — input: `{ code: 'password-required' }`; expected: the message appears.

Static checks:

- [ ] Grep proves the old narrowing is gone — input: `rg -n "isRecoverableException|onException: onFailed" apps`; expected: no output after Step 17.

## E2E (Playwright specs)

- [ ] `e2e/connection-state.spec.ts` `a server restart shows lost, reconnecting, then clears` — steps: Ana and Bruno open a shared document on the restartable server, `stopServer`, wait, `startServer`; expected: `connection-banner` `data-state="lost"` within 30 s of the stop, `reconnecting` observed, no banner within 30 s of the restart.
- [ ] `e2e/connection-state.spec.ts` `an edit typed while the server is down reaches the other author after reconnect` — steps: `stopServer`, Ana types `' <ANA-OFFLINE>'`, `startServer`; expected: Bruno's text contains the marker within 60 s, and Ana's event `serverTime` is no earlier than the restart.
- [ ] `e2e/connection-state.spec.ts` `the session cookie removed shows failed, an inert editor and a working Reload` — steps: `clearCookies`, `stopServer`, `startServer`, sign in again on a second page in the same context, Reload on the first; expected: `failed` banner with role `alert` within 60 s and `inert` on the editor, then no banner and editable text.
- [ ] `e2e/collaboration.spec.ts` `an edit rejected under a concurrent delete does not stop the editor` — steps: the existing spec; expected: still green with the warn narrowing and the status line.

## Prove it for real — Playwright MCP

- [ ] Happy path, entry to exit: two authors on the local stack, edit access; restart the server; expected: lost, then reconnecting, then the banner clears; the editor never shows `EDITOR_FAILED_MESSAGE`.
- [ ] Empty: open a document while online; expected: no connection banner, no layout shift.
- [ ] Single: one restart; expected: exactly one banner at a time, no stacking.
- [ ] Many: three restart cycles; expected: no more than one banner, the notice clears each time.
- [ ] Rejected input: a warn diagnostic in the page; expected: no banner, editor editable, `console.warn` with the message.
- [ ] Browser Back mid-flow: press Back while Failed; expected: the documents list loads with no error and no banner on a fresh visit.
- [ ] Reload mid-flow: reload the browser tab during Reconnecting; expected: the document reopens, no banner until the next callback.
- [ ] Two authors in two contexts at once: Ana restarts, Bruno watches; expected: Bruno sees the same banner sequence within one poll interval.
- [ ] Latency and disconnect: restart with the members route answering 500 (Playwright route); expected: Reconnecting stays, Recovered never shows, the banner clears only after the poll succeeds.
- [ ] Console and network clean: zero console errors and zero failed requests, other than the refused members request and the refused socket during the restart and cookie tests.
- [ ] 320 px, light and dark: Reconnecting and Failed; expected: no horizontal page scroll, banner at most three lines, Reload fully visible, no layout jump on load or theme switch. Screenshots at `docs/features/connection-state/media/`.
- [ ] 375 px, light and dark: Reconnecting and Failed; expected: as at 320 px. Screenshots at `docs/features/connection-state/media/`.
- [ ] 768 px, light and dark: Reconnecting and Failed; expected: as at 320 px, banner on one or two lines. Screenshots at `docs/features/connection-state/media/`.
- [ ] 1024 px, light and dark: Reconnecting and Failed; expected: as at 320 px, editor area full width under the banner. Screenshots at `docs/features/connection-state/media/`.
- [ ] 1280 px, light and dark: Reconnecting and Failed; expected: as at 320 px. Screenshots at `docs/features/connection-state/media/`.
- [ ] 1536 px, light and dark: Reconnecting and Failed; expected: as at 320 px. Screenshots at `docs/features/connection-state/media/`.
- [ ] 1920 px, light and dark: Reconnecting and Failed; expected: as at 320 px. Screenshots at `docs/features/connection-state/media/`.
- [ ] 2560 px, light and dark: Reconnecting and Failed; expected: as at 320 px, banner text not stretched past the editor width. Screenshots at `docs/features/connection-state/media/`.
- [ ] With a past version shown at 1280 px: expected: the connection banner sits above the version banner and both are full width.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

- [ ] Claim 1: Recovered shows only when the server confirms — attack: block the members route during the restart; expected: the banner stays Reconnecting, never Recovered; result: refuted | held.
- [ ] Claim 2: Reload leaves exactly one live collaboration socket — attack: press Reload three times while watching `page.on('websocket')`; expected: one open socket after each Reload; result: refuted | held.
- [ ] Claim 3: a warn diagnostic never fails the editor — attack: raise a warn diagnostic during a remote edit in the E2E and check the page; expected: no failed banner and the editor still syncs; result: refuted | held.

## Coverage honesty

- A real `worker-transport-failed` cannot be produced locally. Only the payload narrowing is unit-tested, with the code as a literal.
- The E2E refuses reconnects with a removed cookie. The close code the browser sees may differ from the 4401 the spec names; the recorded callback sequence is the evidence.
- Unsynced edits at Reload (design row 7.25) are not tested. The Failed copy makes no claim about them.
- A client-side network drop is not reproduced. Recovered may show while the server still holds the socket, as the spec accepts.
- Outages longer than the provider's retry budget are not tested.
- The three-second notice timing is proven with fake timers; the E2E checks only visible-then-gone with generous timeouts.
- The eight widths are sampled in the MCP walk, not every state at every width in unit tests.
