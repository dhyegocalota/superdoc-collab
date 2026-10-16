# An async `upgrade` handler leaves the raw socket with no `'error'` listener

- Date: 2026-10-16
- Inspired by: slice 3 Task 9 review (reproduced on Node 24 with a standalone probe: a client reset during the authorize window raised an uncaught `ECONNRESET`); sibling of [worker threads need an error listener](2026-10-16-worker-threads-need-an-error-listener.md)
- Revisited: 2026-10-16 — fixed in `attach-collaboration.ts` with the ws README pattern and a reset-mid-authorize test

## Signal
The server exits with an uncaught `ECONNRESET` the moment a client opens a WebSocket upgrade and resets the connection before authentication finishes. No session is needed and `Origin` is trivially spoofed outside browsers.

## Cause
Node removes its own socket error listener before emitting `upgrade`; ws attaches its listener only inside `handleUpgrade`. A synchronous handler reaches `handleUpgrade` before any event can fire. Once the handler awaits (session lookup, membership check), the socket has zero `'error'` listeners for the whole await window.

## Do
Attach `socket.on('error', onSocketError)` before the first `await`, remove it right before `handleUpgrade`, and keep a test that resets the socket mid-authorize and then asserts the server still answers. Any Node EventEmitter that can emit `'error'` while nobody listens (sockets, workers, streams) kills the process; add the listener at the same place the emitter is obtained.

## Anchor
`apps/server/src/collaboration/attach-collaboration.ts`, `attach-collaboration.test.ts`
