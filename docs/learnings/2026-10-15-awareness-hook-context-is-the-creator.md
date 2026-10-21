# Every awareness update appears to come from the first user who opened the room
- Date: 2026-10-15
- Inspired by: the proof of concept's results (finding 6) and its E3 two-tabs test
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-18 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
Logging `context` inside `onAwarenessUpdate` always prints the identity of whoever created the room, no matter which client moved its cursor or declared itself.

## Cause
Hocuspocus passes the document's creation context to `onAwarenessUpdate`, not the sender's. The hook does not say which socket produced the update.

## Do
Derive identity from `document.connections[*].clients`, which ties each awareness clientId to the socket that declared it, and take that socket's `connection.context.userId`. Accept a declaration only when the awareness state's `userId` equals that socket's user.

## Anchor
- `apps/server/src/collaboration/client-declarations.ts` — declares the clients of each connection
- `libs/history/src/update-log.ts` — `UpdateLog.declareClientIdentity`
