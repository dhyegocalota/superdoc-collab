# Tester briefing: Room admission

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## Groups G1 and G2 (core)

### What changed

- `libs/history/src/document-history.ts`: `isBootstrapCommitted({ document })` and `findCommittedSnapshot({ log, documentName })`, the first snapshot whose state is committed.
- `libs/history/src/update-log.ts`: `appendCommitted` (committing update and snapshot in one transaction, snapshot sequence equals the appended sequence) and `snapshotAfter`.
- `libs/history/src/projection.ts`: the projection starts at the first committed snapshot and falls back to the log scan.
- `libs/types`: reservation, rate-limit and close-code constants, `MAX_SOCKET_MESSAGE_BYTES`, and `OpenedDocument.creatorAttempt` and `creatorEpoch`. `apps/web/src/testing/opened-document.ts` returns both as null.
- `apps/server/src/collaboration/creator-reservations.ts`: process `epoch`; `reserve` answers `{ attempt, epoch }`; fence, commit record, `touch` (silence expiry) and `release` (expires at once, `attemptOf` still answers the holder).
- `apps/server/src/collaboration/bootstrap-state.ts`: snapshot-first `isCommitted`, paged log scan only without a snapshot, `commit` (append plus snapshot of the live room). `ROOM_MODE_SCAN_BATCH_SIZE` lives here and is re-exported by the runtime for `documents-routes.test.ts`.
- `apps/server/src/collaboration/collaboration-context.ts`: the `CollaborationContext` type with `creatorAttempt` and `creatorEpoch`. `collaboration-server.ts` still declares its own copy until G3 imports this one.
- `apps/server/src/collaboration/collaboration-runtime.ts`: `reserveCreator` answers the ticket and closes superseded connections; `roomMode` reads `bootstrap.isCommitted`; `forget` clears reservation and bootstrap.
- `apps/server/src/server.ts`: builds `reservations` (server `now` as clock) and `bootstrap`, passes both to the runtime, exposes `services.reservations`.

### Shapes for G3 and G4

```ts
CreatorTicket = { attempt: number; epoch: string }
CreatorReservations: epoch: string
                     reserve({ documentId, userId }): CreatorTicket | null
                     attemptOf({ documentId, userId }): number | null
                     mayWrite({ documentId, attempt, epoch, isCommitted }): boolean
                     commit({ documentId, attempt }): void
                     touch({ documentId, attempt }): void
                     release({ documentId, attempt }): void
                     forget(documentId): void
BootstrapState:      isCommitted(documentId): boolean
                     commit({ documentId, connectionUserId, connectionActor, update, document }): LoggedUpdate
                     forget(documentId): void
runtime.reserveCreator({ documentId, userId }): CreatorTicket | null
services.reservations: CreatorReservations
```

- **`mayWrite` has an extra `isCommitted` argument** beyond the lead's signature. Without it the class cannot tell a Join socket on a committed room (allowed) from a socket with no attempt on an uncommitted room (refused), especially after a restart wiped its memory. G3 passes `bootstrap.isCommitted(documentId)`.
- **G3 order in `onChange`:** fence with `mayWrite`; if the live room is committed (`isBootstrapCommitted` on the room) and the room was not yet, call `bootstrap.commit` instead of `updateLog.append`, then `reservations.commit({ documentId, attempt })`; otherwise `updateLog.append` then `reservations.touch`. `commit` already appends, so G3 must not append that update twice.
- **G3 release:** call `reservations.release` only when no other connection of the room still has that attempt. Hocuspocus removes the closing connection from the document before `onDisconnect`, so count the remaining ones.
- **G3 arguments:** `reservations` and `bootstrap` are already built in `createServices` before the `createCollaborationServer` call. G3 adds the two arguments to that call and imports `CollaborationContext` from `collaboration-context.ts`.
- **G3 manual unload:** dropped as the lead decided. Hocuspocus 2.15.3 unloads on the last close by default.
- **G4:** the open route calls `runtime.reserveCreator` and returns `attempt` and `epoch` as `creatorAttempt` and `creatorEpoch`.

### How to run

```bash
pnpm --filter @superdoc-collab/history test:unit
pnpm --filter @superdoc-collab/server test:unit -- collaboration
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `document-history.test.ts::isBootstrapCommitted ...` (2 tests) | `Error: isBootstrapCommitted is not implemented` (a13b64d) | 66da02f |
| `pnpm typecheck` (Step 2) | `opened-document.ts(13,3): error TS2741: Property 'creatorAttempt' is missing` (f482490) | 0a93d58 |
| `update-log.test.ts::appendCommitted ...` (2 tests), `::snapshotAfter ...` | `Error: appendCommitted is not implemented`, `Error: snapshotAfter is not implemented` (071c3cf) | 0312442 |
| `document-history.test.ts::findCommittedSnapshot ...` (2 tests) | `Error: findCommittedSnapshot is not implemented` (a190fce) | 9c646ef |
| `projection.test.ts::a commit snapshot starts the projection although a replay of the whole log never sees the commit` | `AssertionError: expected null to be 3` (59746f2) | ac96bf2 |
| `creator-reservations.test.ts` (first 7 rows) | `CreatorReservations is not implemented` (9452149) | ce8e506 |
| `creator-reservations.test.ts` (16 rows after the review changes) | 11 of 16 fail on the old API (23ed472) | f15fb4b |
| `bootstrap-state.test.ts::commit appends ...` and `::isCommitted trusts the snapshot ...` | `TypeError: bootstrap.commit is not a function`, `AssertionError: expected false to be true` (f5baab8) | 135a07d |
| `collaboration-runtime.test.ts::a takeover closes ...` | first red `Error: reserveCreator is not implemented` (a066885); after the review `expected "vi.fn()" to not be called at all, but actually been called 1 times` (bb5fa73) | cccc695, 8e8e46f |
| `documents-routes.test.ts::roomMode stays create ...` and `::roomMode scans a long log in pages ...` | pin: green before and after the wiring (e1b8fc4) | |
| `isCommitted reads a committed room once and caches it` | pin after the rewrite: green when it landed | |

Red commits after the review (23ed472, f5baab8, bb5fa73) change a test against an implementation that still has the old API, so `pnpm typecheck` was red between each red and its green. The lane tip typechecks.

### Hypotheses to attack

1. Hypothesis: an abandoned partial by a higher client id can never hide the winner's commit from `roomMode` or the projection. Break it by: trying other client ids and orders, with and without a snapshot, and checking that without a snapshot the old log scan still decides.
2. Hypothesis: the same user opening twice keeps attempt n without extending the expiry. Break it by: a second open at 30 s, then another editor at 61 s.
3. Hypothesis: a released reservation lets the next editor in at once, while the dropped holder keeps its attempt until that happens. Break it by: release, `attemptOf` for the holder, then another reserve and `attemptOf` again.
4. Hypothesis: after the commit only the committing attempt and attempt-less sockets may write. Break it by: committing attempt 2 after a takeover and writing as attempt 1 and as a foreign epoch.
5. Hypothesis: `appendCommitted` leaves no update row when the snapshot write fails. Break it by: failing the snapshot insert through a constraint instead of a spy.
6. Hypothesis: a takeover closes only the superseded connections of that room. Break it by: two tabs of the new holder and a connection in another room.

### Known gaps

- Nothing in production code calls `attemptOf`, `mayWrite`, `commit`, `touch`, `release` or `bootstrap.commit` yet; G3 wires them.
- The runtime test uses a fake room map, not a real socket. The real 4403 close is covered by G3's and G5's tests.
- `services.reservations` shares the server's `now`, so a fake clock passed to `startServer` also moves reservation expiry.
- The projection fallback to the log scan keeps the old trap for documents committed before this feature that have no snapshot before their first projection; only documents with a commit snapshot are immune.
Written by the developer sub-agents when their steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## G5 (developer-5): measurement and E2E

### What changed

- `e2e/room-admission.spec.ts` (new): five tests, one browser context per author through `signedInContext`. They assert HTTP answers on the open route and `data-testid="document-editor"`, never waiting-page copy.
- `docs/features/room-admission/plan.md`: Step 0 evidence and ticks for Steps 19 to 23.

### Step 0 measurement (unchanged tree, built stack with the fake model)

| Quantity | Value |
|---|---|
| DOCX uploaded | 9,991,684 bytes (9.53 MiB), a stored zip with one 9,988,911-byte noise PNG |
| Frames sent / received on the first sync | 45 / 79 |
| Largest frame sent | 9,989,690 bytes |
| Largest frame received | 9,989,690 bytes |
| Cap `MAX_SOCKET_MESSAGE_BYTES` | 41,943,040 bytes |

The cap leaves 4.2 times headroom. The image travels as one frame right after about 24 small frames, and the commit marker follows in three small frames. The probe was a throwaway Playwright spec outside the repository. The same generator lives in the spec as `buildLargeDocx`.

### How to run

```bash
pnpm exec playwright test room-admission
E2E_SLOW=1 pnpm exec playwright test room-admission
```

`pnpm test:e2e -- room-admission` ignores the filter and runs every spec. `E2E_SLOW=1` enables the 60 s expiry test, which is skipped without it. The stack boots through `playwright.config.ts`, so it needs port 3100 and 3299 free.

### Red today, green after

Failure text is what the run printed on commit `ed459e0`, on the tree before G1 to G4.

| Test (`e2e/room-admission.spec.ts::`) | Red before the change because | Green after because |
|---|---|---|
| `two editors open a fresh document at once and only the first is answered Create` | `Expected length: 1`, `Received length: 2`, array of two `{"roomMode": "create", "status": 200}` | the second concurrent open is answered 409 |
| `the second editor's open is answered 200 Join once the creator commits` | `Expected: 409`, `Received: 200` on the first open response of the second editor's page | the second editor waits, then the poll sees 200 Join and the reload shows the editor |
| `a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor` | `expect(locator).toBeVisible() failed`, the paragraph never renders in 60 s. The page shows the failed editor with "This collaboration room is structurally invalid and was not opened." | the uncommitted room loads empty, the second editor seeds it and the paragraph appears once |
| `a 10 MB DOCX commits and reopens as Join` | pin: green today (4 s) | pin: stays green after the payload cap of Step 8 |
| `a superseded creator's socket closes with 4403 after the 60 s expiry` | `closeCode`: expected 4403, received null after the 60 s poll | the takeover closes the old socket with 4403 |

### Hypotheses to attack

1. Hypothesis: only one of two simultaneous opens is answered Create. Break it by: fire the two opens from two contexts in `Promise.all` 50 times on one fresh document each, and count Create answers.
2. Hypothesis: the creator's tab closing releases the reservation, so the next editor needs no wait. Break it by: close the creator's tab during the first sync and open as the second editor within 2 s, inside the store debounce.
3. Hypothesis: a 10 MB DOCX syncs below the cap. Break it by: a DOCX of exactly 10 MiB, and one whose room state is larger than the file (many tracked changes).
4. Hypothesis: a takeover after expiry fences the old creator. Break it by: let the old creator type after 4403, and reload it. Expect 409 until the new creator commits.
5. Hypothesis: the E2E would catch a regression that serves Create twice. Break it by: revert only the 409 branch for editors and confirm the first test goes red.

### Known gaps

- Step 21 cannot cut a real creator mid-stream. Chromium runs the collaboration socket in a worker, which `routeWebSocket` does not intercept, and closing the page at the large frame still lets the commit land (all 5 completed probe runs committed). The test copies the log rows that precede the commit of a real creator's document into a fresh document, through `history.sqlite` in `E2E_DATABASE_DIR`. It then opens that document as the second editor. The abandoned prefix is genuine creator output, but the cut is simulated.
- The plan predicted duplicated paragraphs for Step 21. On the current tree the second editor instead meets a room that SuperDoc rejects as structurally invalid, most likely because the creator's bootstrap claim in the room meta stays pending. The review focus about seeding on top of an abandoned partial may not occur the way it is written. The test is red either way and goes green only if the uncommitted room loads empty.
- Step 23 holds the creator with a raw in-page WebSocket that sends only the authentication message, so it does not exercise a real editor tab. It checks that the old socket closes with 4403 and does not check the failed banner.
- `SUPERSEDED_ATTEMPT_CLOSE_CODE` is a local constant in the spec because G1 has not landed in this lane. Replace it with the import from `libs/types` after the merge.
- The spec holds the DOCX generator and the raw socket helper. Moving them to `e2e/` helper files is a mechanical follow-up the lead can order.
- The two-window waiting page at 375 and 1280 px from the spec's E2E list is not covered here, because the waiting page belongs to final-visuals.
