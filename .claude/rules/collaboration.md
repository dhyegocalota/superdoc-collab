---
paths:
  - "apps/web/**"
  - "apps/server/**"
---

# SuperDoc v2 collaboration

Citations to `poc/...` name files of the proof of concept removed on 2026-10-17; the facts stand, the evidence is summarized in ADR 0001–0004.

SuperDoc facts about the browser UI (editing surface, focus, zoom, iframes) live in `.claude/rules/web-ui.md`.

## Versions
- `superdoc` 2.23.0, `@superdoc/sdk` 2.20.0, `@hocuspocus/server` 2.15.3, `@hocuspocus/provider` ^2.15.3, `yjs` ^13.6.33. (poc/package.json)

## Client configuration
- A document is collaborative through `v2Collaboration: { providerType: 'hocuspocus', documentId, serverUrl, roomMode: 'create' | 'join', token }`. (poc/client/main.ts)
- The first author opens the room with `roomMode: 'create'` and the seed DOCX; the others use `'join'`. (poc/client/main.ts, poc/tests/harness.ts)
- The room name on the server is `sd2/v2.1/<documentId>`. (poc/tests/harness.ts, ADR 0001)
- Readiness is signalled by `onCollaborationReady`; connection changes by `onCollaborationConnectionChange`. (poc/client/main.ts)
- Text is read with `superdoc.activeEditor.doc.getText({})`. (poc/client/main.ts)

## SuperDoc limits
- v2 gives no ProseMirror access and no version-history API. (ADR 0001)
- The `diff.capture/compare/apply` payload is opaque. (ADR 0001)
- `trackChanges.list()` returns author, ISO date, inserted/deleted text, `imported: true` and the room's `blockId` scheme; it works in the browser and in Node via `@superdoc/sdk`. (poc/RESULTS.md, poc/tests/node/t10-imported-tracked-changes.test.ts)
- The room `Y.Doc` is an operation journal. Top-level maps: `meta`, `package`, `operations`, `checkpoints`, `shards`, `content`, `root-op-evidence`. Transactions carry `createdByClient` and `createdAtMs`; `author` is always `headless-kernel`, so identity comes from the transport. (poc/RESULTS.md)
- The room grows about 2.8 KB per keystroke by itself. (poc/RESULTS.md)

## Editing behavior
- A keyboard paragraph merge (Backspace at a paragraph start, Delete at an end) is a no-op in collaborative mode; use `doc.blocks.merge({ first, second })`. (poc/RESULTS.md, poc/tests/e-edge-cases.spec.ts)
- Undo is recorded as a deletion by the undoer; it emits reversed per-character deletions. (poc/RESULTS.md E8; reversed per-character form from the task brief)
- Under concurrent remote edits, a click on a text run occasionally leaves focus on `BODY`; the caret occasionally lands out of order under fast concurrent typing. Neither affects convergence. (poc/RESULTS.md)

## Build
- The client must be built and served with `vite preview`; the dev server fails with SuperDoc's worker (task brief). The POC pins port 5199. (poc/vite.config.ts)

## Hocuspocus server
- Use `new Hocuspocus({...})`; the exported `Server` is a singleton. (poc/RESULTS.md, poc/server/collaboration-server.ts)
- `onAwarenessUpdate` receives the document creator's context, not the sender's; tie awareness clientIds to sockets through `document.connections[*].clients`. (poc/RESULTS.md, ADR 0002)
- `onAuthenticate` returns `{ userId }` as the connection context. (poc/server/collaboration-server.ts)
- In `apps/server` it returns `{ userId, documentId, actor }`. The upgrade path in `request.url` picks the credential: `/collaboration` takes the session cookie only, `/collaboration/agent` takes a room token in the `token` field only and skips the `Origin` check. (apps/server/src/collaboration/collaboration-server.ts, ADR 0025)
- The room token and the read-only flag are fixed when an SDK session opens; replace a cached session when the role, the name or the token age changed. (apps/server/src/agent/agent-sessions.ts, docs/learnings/2026-10-17-a-reused-sdk-session-keeps-the-room-token-and-read-only-flag-from-open.md)
- Load the room with `Y.applyUpdate(document, state, 'update-log-replay')`; `onChange` skips that origin. (poc/server/collaboration-server.ts)
- `onCollaborationConnectionChange` reported `synced -> degraded -> degraded` across a server restart and never a recovery state, though sync resumed; do not rely on it for recovery. (poc/RESULTS.md)
- The members answer carries `isCurrentUserOnline`, whether the server holds a live Hocuspocus connection for the caller in that room; `useMembers` returns it as `null` before the first answer and after a failed poll, never as a stale `true`. (apps/server/src/documents/documents-routes.ts, apps/web/src/features/editor/use-members.ts, ADR 0032)
- `onException` payloads are narrowed by `exceptionOutcome` in `apps/web/src/features/editor/superdoc-exceptions.ts`: a diagnostic with `severity: 'warn'` is logged, `edit-rejected` is recoverable, a `collaborationReason` or the `worker-transport-failed` code is a connection failure, everything else including error diagnostics is fatal. Never treat every exception as fatal: SuperDoc raises warn diagnostics for conditions the editor survives. (ADR 0032)
- The members answer carries `isCurrentUserOnline`, whether the server holds a live Hocuspocus connection for the caller in that room; `useMembers` returns it as `null` before the first answer and after a failed poll, never as a stale `true`. The flag is per tab: the socket URL and the members request both carry the page load's `tab` query, the connection context stores it, and the route answers from `runtime.onlineTabIds`; a request without `tab` keeps the per-user answer. (apps/server/src/documents/documents-routes.ts, apps/server/src/collaboration/collaboration-runtime.ts, apps/web/src/features/editor/use-members.ts, ADR 0032)
