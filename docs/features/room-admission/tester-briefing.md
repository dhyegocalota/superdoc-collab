# Tester briefing: Room admission

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## Groups G1 and G2 (core)

### What changed

- `libs/history/src/document-history.ts`: exports `isBootstrapCommitted({ document })`; `findBootstrapSequence` uses it.
- `libs/types/src/constants.ts`, `libs/types/src/documents.ts`: reservation, rate-limit and close-code constants; `MAX_SOCKET_MESSAGE_BYTES`; `OpenedDocument.creatorAttempt`.
- `apps/web/src/testing/opened-document.ts`: `openedAs` returns `creatorAttempt: null`.
- `apps/server/src/collaboration/creator-reservations.ts`: in-memory reservation with a latest-attempt fence.
- `apps/server/src/collaboration/bootstrap-state.ts`: commit cache moved out of the runtime, plus `markCommitted` writing a snapshot of the live room.
- `apps/server/src/collaboration/collaboration-runtime.ts`: `reserveCreator`; `roomMode` reads `bootstrap.isCommitted`; `forget` clears reservation and bootstrap cache. `ROOM_MODE_SCAN_BATCH_SIZE` now lives in `bootstrap-state.ts` and is re-exported from the runtime so `documents-routes.test.ts` imports keep working.
- `apps/server/src/server.ts`: builds `reservations` (clock is the server's `now`) and `bootstrap`, passes both to the runtime, exposes `services.reservations`.

### Shapes for G3 and G4

```ts
CreatorReservations: reserve({ documentId, userId }): number | null
                     attemptOf({ documentId, userId }): number | null
                     mayWrite({ documentId, attempt }): boolean
                     release({ documentId, attempt }): void
                     forget(documentId): void
BootstrapState:      isCommitted(documentId): boolean
                     markCommitted({ documentId, sequence, document }): void
                     forget(documentId): void
runtime.reserveCreator({ documentId, userId }): number | null
services.reservations: CreatorReservations
```

- G3 must thread `reservations` and `bootstrap` into `createCollaborationServer` in `server.ts`. Both are already built there, before the call (`reservations` and `bootstrap` constants in `createServices`); G3 adds the two arguments to that call.
- `collaboration-runtime.ts` reads `creatorAttempt` through a local `AttemptContext` type because `CollaborationContext` has no such field yet. After G3 adds it, that local type can become `CollaborationContext`.
- G4's open route calls `runtime.reserveCreator` and returns its value as `creatorAttempt`. `markCommitted` is G3's `onChange` call, with `sequence` from the appended update.
- The server's open route did not build an `OpenedDocument` literal that failed typecheck, so no compile fix was needed there.

### How to run

```bash
pnpm --filter @superdoc-collab/history test:unit
pnpm --filter @superdoc-collab/server test:unit -- collaboration
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/history/src/document-history.test.ts::isBootstrapCommitted is true only for a document whose meta marks the bootstrap committed` | `Error: isBootstrapCommitted is not implemented` (commit a13b64d) | marker read through `isBootstrapCommitted` (66da02f) |
| `libs/history/src/document-history.test.ts::isBootstrapCommitted is false for a document with no meta marker` | same failure | same fix |
| `pnpm typecheck` (Step 2) | `apps/web/src/testing/opened-document.ts(13,3): error TS2741: Property 'creatorAttempt' is missing` (commit f482490) | `openedAs` returns `creatorAttempt: null` (0a93d58) |
| `creator-reservations.test.ts` (7 rows of one table) | `Error: CreatorReservations is not implemented` (9452149) | class implemented (ce8e506) |
| `collaboration-runtime.test.ts::a takeover closes the superseded creator's socket with 4403 and the reason` | `Error: reserveCreator is not implemented`, not the planned `is not a function`, because the stub keeps typecheck green (a066885) | `reserveCreator` implemented (cccc695) |
| `bootstrap-state.test.ts::markCommitted writes a snapshot of the live room at the commit sequence` and `::isCommitted reads a committed room once and caches it` | `Error: createBootstrapState is not implemented` (db60480) | implemented (cc98525) |
| `documents-routes.test.ts::roomMode stays create until the bootstrap commits` and `::roomMode scans a long log in pages until the first committed bootstrap` | pin: green before and after the wiring (e1b8fc4) | |

### Hypotheses to attack

1. Hypothesis: the same user opening twice keeps attempt n and does not extend the expiry. Break it by: reserving, waiting past the first expiry after a second open, and checking another editor gets n + 1.
2. Hypothesis: a released reservation never reuses an attempt number. Break it by: release, reserve as another user, and check the old attempt cannot write.
3. Hypothesis: a takeover closes only connections of the taken-over room whose attempt differs. Break it by: two tabs of the new holder in the same room and a connection in a different room.
4. Hypothesis: the commit snapshot holds the live room, not the log. Break it by: appending an abandoned partial, committing from a clean live room, then materializing and checking the partial is absent after the snapshot sequence.
5. Hypothesis: `forget` of a document clears reservation, bootstrap cache and closes sockets. Break it by: deleting a document with a live reservation and reopening a fresh one.

### Known gaps

- Nothing yet calls `markCommitted`, `attemptOf`, `mayWrite` or `release` in production code; G3 wires them.
- The runtime test uses a fake `Hocuspocus` room map, not a real socket. The real 4403 close is covered by G3's and G5's tests.
- `services.reservations` shares the server's `now`, so tests that pass a fake clock to `startServer` move reservation expiry too.
