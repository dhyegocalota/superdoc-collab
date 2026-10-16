# Every awareness update appears to come from the first user who opened the room
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md (finding 6); poc/tests/e-edge-cases.spec.ts::E3
- Revisited: 2026-10-16 — still true

## Signal
Logging `context` inside `onAwarenessUpdate` always prints the identity of whoever created the room, no matter which client moved its cursor or declared itself.

## Cause
Hocuspocus passes the document's creation context to `onAwarenessUpdate`, not the sender's. The hook does not say which socket produced the update.

## Do
Derive identity from `document.connections[*].clients`, which ties each awareness clientId to the socket that declared it, and take that socket's `connection.context.userId`. Accept a declaration only when the awareness state's `userId` equals that socket's user.

## Anchor
- `poc/server/collaboration-server.ts` — `declareConnectedClients`
- `poc/lib/update-log.ts` — `UpdateLog.declareClientIdentity`
- `poc/tests/e-edge-cases.spec.ts` — `E3: the same user in two tabs is one author with two Yjs clients`
