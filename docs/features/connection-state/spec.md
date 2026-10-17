# Connection state

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 (brief + design 1.14)
**ADRs:** [0032](../../adr/0032-connection-state-truth-callback-for-transitions-server-presence-for-recovery.md)
**Not changing:** the Hocuspocus provider's own reconnect policy, the members poll interval (`MEMBERS_REFRESH_MS`), the version viewer's inert behaviour.

## Problem

The live editor treats every `onException` payload as fatal. SuperDoc 2.23.0 also reports structured warnings through that event, such as a render hiccup during a remote edit or a degraded-performance notice, and the editor keeps working. The author sees "The editor stopped working" anyway (brief finding 1).

The live editor never subscribes to `onCollaborationConnectionChange`. A lost connection, a server restart or a revoked permission is invisible to the author, who keeps typing into a room that no longer receives the edits (brief finding 2). Yjs keeps those edits in the browser and syncs them on reconnect, but nothing tells the author that.

## Goals

| # | Behaviour | Proof |
|---|-----------|-------|
| G1 | A warn diagnostic is logged and changes no state. | Unit, exception narrowing |
| G2 | A payload with `collaborationReason`, or code `worker-transport-failed`, moves the connection to Failed with its reason. | Unit, exception narrowing |
| G3 | `edit-rejected` keeps today's status line, cleared by the next click. | Unit, existing E2E `collaboration.spec.ts` |
| G4 | Lost and Reconnecting show as the callback reports them. The copy says edits stay in this browser and are dated when they sync. | Unit, merge table; E2E server restart |
| G5 | Recovered shows when the server sees the user online and the callback has not said failed. It clears after `RECOVERED_NOTICE_MS`. | Unit, state machine; E2E server restart |
| G6 | Failed makes the editor `inert`, dims the editor area, shows the reason and a Reload button. Reload reopens the document and remounts the editor. | E2E session cookie removed |
| G7 | A callback whose state is `synced` or whose kind is `recovered` refetches members at once. | Unit, state machine |
| G8 | The version viewer applies the same exception narrowing. Its inert behaviour is unchanged. | Unit, exception narrowing |
| G9 | With a past version shown, the connection banner sits above the version banner. | Playwright MCP walk |
| R | The banner and the inert state read well at 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 px. No horizontal page scroll, no clipped Reload, text at most three lines on phones for Lost, Reconnecting and Recovered, and at most five for Failed (title, then one paragraph with the reason and the unsynced-edits sentence); the Reload button may wrap to its own row and stays fully inside the viewport. Lines are counted on the text block without padding. Revised by the lead on 2026-10-17 after the width measurement at 320 px, no layout jump on load or theme switch. | Playwright at eight widths; Playwright MCP walk |

## Non-goals

- `navigator.onLine` or any browser online flag.
- A heartbeat or any new transport for presence.
- Keeping the editor's state across a full page reload.
- The creator reservation and socket limits, which belong to `room-admission`.
- Keeping edits that had not synced when Reload runs. This waits on design row 7.25.

## Data flow

### States

The states and their triggers follow design 1.14. `ConnectionState` lives in `libs/types`.

| From | To | Trigger |
|------|----|---------|
| any | Lost | `onCollaborationConnectionChange` reports `kind: 'lost'` |
| Lost | Reconnecting | the callback reports `kind: 'reconnecting'` |
| any but Failed | Failed | the callback reports `kind: 'failed'` or `state: 'failed'`, or a connection exception arrives; final until Reload |
| Lost, Reconnecting | Recovered | the members poll says the server sees this user online, and the callback has not said failed |
| Recovered | Online | after `RECOVERED_NOTICE_MS` |

- A `Recovered` moment resets the callback reading to Clear, so the next poll does not enter Recovered again.
- The poll never confirms recovery on its own. The callback's Lost or Reconnecting must come first.

### Merge

`useConnectionState` holds the latest transport reading from the callback and the server flag from `useMembers`. `TransportReading` is `Clear`, `Lost`, `Reconnecting` or `Failed`. The callback maps to a reading by its kind and state: `lost`, `reconnecting` and `failed` map to themselves; `initial` maps to Clear; `recovered` and state `synced` keep the current reading and only set `hasSynced`, which triggers an immediate members refetch (ADR 0032: the callback never confirms recovery on its own). Revised by the lead on 2026-10-17 after the plan review.

**Lost is usually invisible.** The provider reports `lost` and `reconnecting` in the same tick, so the banner renders as Reconnecting at once; a Lost render of a few milliseconds happens only occasionally. The state stays in the machine and its unit tests, but no end-to-end test or walk requires seeing it; the restart proof asserts Reconnecting then Recovered, with Lost optional before them. Recorded by the lead on 2026-10-17 from the tester's walk.

**Request after Lost.** When the reading turns Lost or Reconnecting the hook records `lostAt`, cancels the in-flight members request (`queryClient.cancelQueries`) and refetches. A members answer counts only when its `dataUpdatedAt` is later than `lostAt`; `useMembers` exposes that time as `membersAnsweredAt`. A flag that still reads `true` from before the outage therefore never shows Recovered.

**Per-tab presence.** The flag is per tab, not per user, so a second tab of the same person cannot keep this tab "online". Each page load creates a `tabId` (`crypto.randomUUID()`), appends it as the `tab` query of the collaboration socket URL (`collaboration-config.ts`), where `onAuthenticate` stores it in the connection context, and sends it as the `tab` query of the members request; the members route answers `isCurrentUserOnline` for that tab through `runtime.onlineTabIds(documentId)`. A members request without `tab` keeps the per-user answer for other callers.

| Transport reading | Server sees this user online | Banner state |
|-------------------|------------------------------|--------------|
| Failed | any | Failed |
| Lost or Reconnecting | no, or unknown (`null`) | Lost or Reconnecting |
| Lost or Reconnecting | yes | Recovered |
| Clear | any | Online |

### Reload

1. The author presses Reload in the banner.
2. `DocumentPage` refetches the open query (`openedDocumentQueryKey`) and the file query (`DOCUMENT_FILE_QUERY_KEY`) and awaits both, so the answer for an already bootstrapped room comes back as `RoomMode.Join` with the current file.
3. The hook resets to reading Clear and state Online.
4. Only then `DocumentPage` bumps `editorGeneration`, used as the `key` of `SuperDocEditor` and passed to `useEditorSetup`, which drops its captured setup when the generation changes (today it captures once behind a `setup === null` guard). The old instance is destroyed in its cleanup and a new one mounts with the refetched setup.
5. The old instance's handlers check an `isActive` flag and drop late callbacks.

## Interfaces

- `libs/types/src/connection.ts` (new, exported from `index.ts`):
  - `ConnectionState { Online = 'online', Lost = 'lost', Reconnecting = 'reconnecting', Recovered = 'recovered', Failed = 'failed' }`
  - `ConnectionFailureReason { AccessDenied = 'access-denied', ConnectionFailed = 'connection-failed', SyncTimeout = 'sync-timeout', WorkerTransportFailed = 'worker-transport-failed', SessionEnded = 'session-ended', Unknown = 'unknown' }`
- `libs/types/src/constants.ts`: `RECOVERED_NOTICE_MS = 3 * SECOND_MS`.
- `libs/types/src/documents.ts`: `DocumentMembers` becomes `{ members: DocumentMember[]; isCurrentUserOnline: boolean }`.
- `apps/server/src/documents/documents-routes.ts`, members route: reads the user id from `context.var.user.id` and adds `isCurrentUserOnline: online.has(userId)`. `online` is `runtime.onlineUserIds(documentId)`, the user ids with a live Hocuspocus connection in that room. The flag reflects what the server holds, not what the browser believes.
- `apps/web/src/features/editor/use-members.ts`: returns `isCurrentUserOnline: boolean | null`. It is `null` before the first answer and while the latest poll has failed, never the previous answer.
- `apps/web/src/features/editor/superdoc-exceptions.ts`:
  - `SuperDocExceptionCode` gains `WorkerTransportFailed = 'worker-transport-failed'`. The installed types do not list that literal, so the code is read as a string.
  - `ExceptionOutcome { Logged, Recoverable, ConnectionFailed, Fatal }`.
  - `exceptionOutcome(payload): ExceptionOutcome`: a warn diagnostic is Logged; `edit-rejected` is Recoverable; `collaborationReason` or the worker code is ConnectionFailed; everything else, including error diagnostics, is Fatal.
  - `failureReasonOf(payload): ConnectionFailureReason`, with an explicit `Unknown` branch.
- `apps/web/src/features/editor/use-connection-state.ts`:
  - `useConnectionState({ documentId, isCurrentUserOnline }): { state, failureReason, reportTransport, resetConnection }`.
  - `TransportReport { reading: TransportReading; failureReason: ConnectionFailureReason | null; hasSynced: boolean }`.
  - `reportTransport` refetches members when `hasSynced` is true.
  - Exported pure `mergeConnectionState({ reading, isCurrentUserOnline }): ConnectionState` for the merge table.
- `apps/web/src/features/editor/superdoc-editor.tsx`: gains `onTransportReport: (report: TransportReport) => void`. Its `onCollaborationConnectionChange` and `onException` call `onTransportReport` through the `isActive` guard. Fatal keeps `EDITOR_FAILED_MESSAGE`. Recoverable keeps the status line. Logged calls `console.warn` with the diagnostic message, since `apps/web` has no logger.
- `apps/web/src/features/editor/connection-banner.tsx`: `ConnectionBanner({ state, failureReason, onReload })`, following `VersionBanner`. It renders nothing when Online. Failed uses `role="alert"`; the other states use `role="status"`. Each has `data-testid="connection-banner"` and `data-state`.
- `apps/web/src/features/editor/connection-copy.ts`: `LOST_TITLE`, `RECONNECTING_TITLE`, `RECOVERED_TITLE`, `FAILED_TITLE`, `KEPT_AND_DATED_DETAIL`, `RELOAD_LABEL`, and `FAILURE_REASON_COPY: Record<ConnectionFailureReason, string>` with an `Unknown` entry.
- `apps/web/src/features/editor/document-page.tsx`: holds `editorGeneration`, calls `useConnectionState`, renders `ConnectionBanner` between the top bar and the flex row, so it is full width and above the version banner. `isInert` is true when time travel is viewing or the state is Failed. The editor area gets `opacity-60` when Failed.
- `apps/web/src/features/versions/version-viewer.tsx`: `onException` maps through `exceptionOutcome`. Logged and Recoverable do nothing. ConnectionFailed calls `onConnectionFailed`. Fatal calls `onFailed`. Its local `ConnectionState` enum is renamed `ViewerConnectionState` so it does not shadow the shared enum. Its refusal rule stays as it is.

## Failure handling

- The members poll fails while Lost: the flag becomes `null`, the banner keeps its state, and the previous answer is never reused.
- A callback arrives after unmount or after Reload: the `isActive` guard drops it.
- Two callbacks in one tick: they fold in arrival order, and Failed is sticky.
- The server sees the user online while the callback says failed: Failed wins.
- An exception and a callback both report failure: the reading and reason from the exception take precedence over Unknown from the callback.
- The callback says failed with no exception and the latest members poll was a 401: the reason is SessionEnded, the copy is "Your session ended. Sign in again." and the button reads "Sign in" and navigates to the sign-in route with `next` set to the current path, in place of Reload. The tester captured the removed-cookie sequence 2026-10-17: lost, reconnecting, failed, each with `detail: null` and no exception, so the transport carries no reason and the app derives it from the 401 (`useMembers` exposes `isSessionEnded`; `resolveFailureReason` turns Unknown into SessionEnded).
- The callback says failed with no exception and no 401: the reason is Unknown. The developer reads the callback's `detail` at runtime to confirm which values occur (design 1.14).
- A Lost reading that arrives during Recovered cancels the recovery timer. The timer is also cleared on unmount.
- A `synced` callback while Online refetches members and changes nothing else.
- Only a members answer whose request started after the transport reading turned Lost or Reconnecting can confirm Recovered; an answer already in flight at that moment is ignored. If the browser drops its socket while the server still holds it, the server reports the user online until its own socket timeout closes it, so Recovered can show early for that window. Accepted by the lead on 2026-10-17: the window is bounded by the server timeout and the next Lost reading cancels the recovery.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where the connection state shows | banner under the top bar; status pill beside Members | Banner (design 6.12) | 2026-10-17 |
| Does Reload keep edits that had not synced (design row 7.25) | keep them; discard them; warn before Reload | Spike answered 2026-10-17: Reload loses them. The bundle has no IndexedDB persistence; a sentence typed during an outage was gone after a reload, while the same sentence synced when the page stayed open until the server returned. So the Failed banner's detail says, after the reason: "Edits that have not synced are lost when you reload. Download the document first to keep them." (`UNSYNCED_LOST_ON_RELOAD_DETAIL` in `connection-copy.ts`). Decided by the lead within the approved scope. | 2026-10-17 |
| Does Reload show "Loading document…" as design 1.14 says | show it; remount in place | Remount in place. The open and file queries are invalidated and the editor remounts under a new key; the brief asks only that the document reopens and re-authenticates, which the new socket does. Decided by the lead within the approved scope. | 2026-10-17 |
| Version viewer edit rejection | fail time travel as today; log and ignore | Log and ignore: the viewer is inert and cannot take a user edit. Decided by the lead within the approved scope. | 2026-10-17 |

## Test strategy summary

- Unit, `superdoc-exceptions.test.ts`: the narrowing table, one row per payload shape, including error diagnostics staying Fatal and each collaboration reason mapping to its enum.
- Unit, `use-connection-state.test.ts`: the merge table row by row, the state machine with fake timers (Lost, then Reconnecting, then Recovered, then Online after `RECOVERED_NOTICE_MS`), Failed stickiness, two callbacks in one tick, Reload reset, and a Lost cancelling Recovered.
- Unit, `use-members` and the members route in `documents-routes.test.ts`: `isCurrentUserOnline` is true with a live socket and false without one, and `null` after a failed poll.
- Unit, `connection-banner.test.tsx`: each state's copy, the Unknown reason line, and no output when Online.
- E2E, `e2e/connection-state.spec.ts`, one browser per author: the server restarted mid-session shows Lost, then Reconnecting, then clears; an edit typed while down reaches the other author after reconnect. The session cookie removed shows Failed, an inert editor and a working Reload.
- Playwright MCP walk, recorded for the PR: every state at the eight widths, with screenshots, plus dark mode for Reconnecting and Failed.
- Existing tests that must still pass: `superdoc-exceptions.test.ts` and the `collaboration.spec.ts` case for a rejected edit.
