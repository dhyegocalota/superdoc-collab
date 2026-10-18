# Owner brief: collaboration resilience

Received from the owner on 2026-10-17. It covers two features built in this order: `connection-state` (this folder) and `room-admission`. The decisions under "Decisions already made by the owner" are binding; the lead verified every finding against the local code on the same day.

## Why

A verification against the SuperDoc open-source repository (github.com/Harbour-Enterprises/SuperDoc, main at commit 4afe6b3, 2026-10-17) found four gaps between their collaboration example, their hosted docs collaboration server, their collaboration docs pages, and this project. The owner also wants the user's own connection state and offline editing made visible in the editor.

## Verified findings (confirmed against the installed `superdoc` 2.23.0 bundle and the local code)

1. **Every `onException` is treated as fatal.** SuperDoc 2.23.0 emits structured diagnostics (`SuperDocExceptionDiagnosticPayload`: `diagnosticCode` one of `PARSE_ERROR | RENDER_ERROR | UNSUPPORTED_FEATURE | PERFORMANCE_ERROR`, `severity: 'warn' | 'error'`) through the same `exception` event, deduped per `(documentId, generation, internalCode)`. Warnings fire for render-readiness hiccups during remote edits, degraded performance and unsupported features while the editor keeps working. `apps/web/src/features/editor/superdoc-editor.tsx` (`onException`) and `apps/web/src/features/versions/version-viewer.tsx` (`onException: onFailed`) show the failure state on any payload other than `edit-rejected`. Upstream narrows with `'diagnosticCode' in payload` and only logs those (`examples/collaboration/src/main.ts`). The payload union is narrowed by `'stage' in payload` (store init), `'code' in payload` (editor lifecycle), `'collaborationReason' in payload` (collaboration connection, e.g. `'access-denied'`), `'diagnosticCode' in payload` (structured diagnostic).

2. **The live editor never learns the connection failed.** Upstream docs (`apps/docs/content/docs/editor/collaboration/run-a-server.mdx`, "Handle connection loss"): a transient outage does not emit `onException`; `onCollaborationConnectionChange` / `getCollaborationConnectionState()` report `lost`, `reconnecting`, `recovered`, `failed`. Socket close `4401`/`4403` or permission denied → `failed`, retries stop for the session. Worker transport failure → `failed` plus `onException` with `code: 'worker-transport-failed'`. Only `version-viewer.tsx` subscribes today; the live editor (`superdoc-editor.tsx`) does not. Rule file note: the POC saw the callback report `degraded` across a server restart and never a recovery state while sync had resumed, so it cannot be the sole source of "online".

3. **Two editors can both create the room.** `apps/server/src/collaboration/collaboration-runtime.ts` returns `RoomMode.Create` until the update log holds a committed bootstrap (`findBootstrapSequence` in `libs/history/src/document-history.ts`). `apps/server/src/documents/documents-routes.ts` answers 409 `NOT_READY` only to readers; two editors opening a fresh document within the same seconds both receive `Create`. Upstream docs (`coordinate-room-creation.mdx`, `initialize-a-document.mdx`): two creators can duplicate content, a WebSocket does not reserve a room, reserve one initializer per document and fence writes per attempt. Upstream `demos/superdoc-collaboration-v2/server/index.ts` records `creatorId` and answers 409 "Room is still being created" to everyone else until ready. Existing tests cover only the reader case: `apps/server/src/documents/documents-routes.test.ts`, `e2e/documents.spec.ts`.

4. **No limits on the collaboration socket.** `apps/server/src/collaboration/attach-collaboration.ts` creates `new WebSocketServer({ noServer: true })` with the `ws` default `maxPayload` of 100 MiB; Hocuspocus 2.15.3 sets none. Upstream hosted server (`apps/docs/collaboration-server/src/worker.ts`) caps 1 MiB per message, 120 messages per second per room, 16 MiB received per room. Uploads are capped by `MAX_UPLOAD_BYTES` (10 MB, `libs/types/src/documents.ts`); the socket is not. `apps/server/src/limits/sliding-window.ts` already exists.

Not in scope, for a later upgrade: the `lastEditActorType` (`human | code`) attribution contract documented in `observe-edits.mdx` is absent from the 2.23.0 bundle.

## Decisions already made by the owner (binding)

- **Split into two features**, each with its own `docs/features/<slug>/` spec, plan and test plan, built in this order:
  1. `connection-state` (web): connection banner, offline editing notice, exception narrowing, read-only editor on failure, self-online flag on the members response.
  2. `room-admission` (server): creator reservation with write fencing and expiry, waiting page that polls and enters on its own, socket payload and rate limits.
- **Offline edits are dated when they sync.** Yjs keeps edits in the browser while disconnected; on reconnect they reach the server as one update with the right author, and the log stamps them with server time at reconnect. No client-supplied timestamps. The banner states this in words.
- **`failed` → editor read-only, banner with the reason, Reload button.** Reload reopens the document (re-authenticates through the cookie). Use the existing `inert` prop on `SuperDocEditor` for the read-only state.
- **Banner source of truth (approach B):** `onCollaborationConnectionChange` flips the banner to lost, reconnecting or failed the instant it fires. Recovery is confirmed by the server: extend the existing members poll (`GET /api/documents/:id/members`, `useMembers`, `MEMBERS_REFRESH_MS`) so the response says whether the current user is online in the room (the server reads live Hocuspocus connections via `runtime.onlineUserIds`). If the server sees me and the callback has not said `failed`, the banner clears. One hook (`useConnectionState`) merges both inputs. No `navigator.onLine`, no heartbeat.
- **Banner states:** online (no banner), lost, reconnecting, recovered (short confirmation then cleared), failed. While lost or reconnecting, the banner says edits are kept in this browser and will be dated when they sync. Pattern: `apps/web/src/features/versions/version-banner.tsx` (`role="status"`, `data-testid`, copy in `*-copy.ts`). States are an enum in `libs/types`.
- **Waiting page:** when the open endpoint answers 409 `NOT_READY`, poll it every couple of seconds and enter the room on its own once the creator's bootstrap commits, with a "Preparing the document…" status. Readers get the same behavior (replaces today's static "The owner has not opened this document yet." dead end). The lead placed the waiting page in `final-visuals` (design section 1.15) because it is web-only against a 409 that already exists; `room-admission` extends who receives that 409.
- **Creator reservation:** the first editor to open a document without a committed bootstrap is reserved as creator (user id, attempt number, expiry); every other editor and reader gets 409 `NOT_READY` until the bootstrap commits. Hocuspocus `onChange` refuses (does not append) writes from a connection whose attempt is not the current one while the room is uncommitted; the connection context carries the attempt. If the creator disconnects or the reservation expires before commit, the reservation is released, writes from the old attempt stay refused, and the next editor who opens receives `Create`. The log keeps partial updates; the projection already ignores anything before the committed bootstrap.
- **Socket limits:** per-message cap as a small multiple of `MAX_UPLOAD_BYTES` (the creator's first sync carries the whole seeded room in one message, so a 1 MiB cap would break create); per-connection rate cap around 120 messages per second using `SlidingWindow`; a breach closes that socket with a policy close code and the client reconnects. Constants in `libs/types`.

## ADRs required before the dependent code

- Connection state truth: callback for transitions, server presence for recovery (alternatives: callback only; browser online flag plus heartbeat).
- Creator reservation and per-attempt write fencing with expiry (alternatives: no reservation; mark failed and require the owner to retry; same creator only).
- Socket payload and rate limits policy (alternatives: 1 MiB fixed cap like upstream; message cap only; spike first).

## Tests the plans must include (beyond the usual unit and E2E)

- Unit: exception payload narrowing (warn diagnostic → logged, not failed; `collaborationReason` and `code: 'worker-transport-failed'` → failed); `useConnectionState` merge table (callback × server-online); reservation state machine (reserve, second editor 409, commit, expiry, old-attempt write refused after takeover); socket cap and rate breach close codes.
- E2E (Playwright, one browser per author like `docs/scenarios`): server restarted mid-session → banner shows lost then reconnecting, clears once the server sees the user again, an edit typed while down appears for the other author after reconnect and is dated at reconnect on the timeline; session cookie removed → banner failed, editor inert, Reload reopens; two editors opening a brand-new document at the same time → exactly one creates, the other waits on "Preparing the document…" and enters on its own; creator closes the tab mid-create → the next editor becomes creator after expiry and the document opens with no duplicated content.
- Playwright MCP walk recorded for the PR (UI changes); screenshots of every banner state.

## Docs that move with the code

`.claude/rules/collaboration.md` (connection states, reservation, limits), `.claude/rules/web-ui.md` (banner pattern), `apps/server/README.md` and `apps/web/README.md` only if purpose changes, a learning if anything contradicts this brief.

## Added by the owner on 2026-10-17, for all three features

The experience must be excellent at every device size: very small phones (320 px) through very large screens (2560 px and beyond). Every test plan covers 320, 375, 768, 1024, 1280, 1536, 1920 and 2560 px in Playwright and in the tester's walk, and "smooth" is a pass criterion: no horizontal page scroll, no clipped controls, no layout jump on load or on theme switch.
