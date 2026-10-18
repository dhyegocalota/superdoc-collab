# A payload or rate cap placed in a Hocuspocus hook does not stop the memory growth, and a peer that ignores the close keeps its socket for 30 s
- Date: 2026-10-17
- Inspired by: room-admission plan review and security rounds ([ADR 0034](../adr/0034-collaboration-socket-payload-and-rate-limits.md)); `ec4910f`, `d60b3a5`
- Revisited: 2026-10-17 — still true
- Revisited: 2026-10-18 — still true; the test name follows the cap (ADR 0040)

## Signal
A flood of small frames or one huge frame sent before the authentication message grows the process memory although a rate or size check sits in `beforeHandleMessage`. Closing the socket from the hook does not stop the message that triggered it. After a server-initiated close, a raw peer that never answers the close frame still holds its socket open for about 30 s.

## Cause
In `@hocuspocus/server` 2.15.3 the message-level hooks run after `ws` has already received and buffered the frame, and Hocuspocus queues every frame that arrives before the authentication message without a bound. `connection.close()` inside a hook does not cancel the message being handled. `ws` has its own `closeTimeout` of 30 s: until it fires, a peer that ignores the close frame keeps the socket.

## Do
Put the caps where the bytes arrive. Set `maxPayload` on the `WebSocketServer` (`ws` closes with 1009 and the provider treats it as final) and count frames per socket in a `message` listener from the first frame, before authentication, then remove the listeners and close with 1008. Set `closeTimeout` once on the socket server so every server-initiated close frees the socket after the grace. `terminateOnError` must return early on a socket that is already CLOSING, or the close frame never reaches the client. Test the close with a raw peer that never answers it, not with a well-behaved client.

## Anchor
- `apps/server/src/collaboration/attach-collaboration.ts` (`SOCKET_SERVER_OPTIONS`, `closeOnBreach`, `terminateOnError`), `socket-message-limit.ts`
- `attach-collaboration.test.ts`: `more frames than the cap before authentication close the socket with 1008, are not applied and are logged without the payload`, `a server close that the peer ignores destroys the socket within the grace period`, `a frame over the payload cap closes with 1009 that the client receives`
- commits `3c397e6`, `5e4458d`, `7943ba2`, `d60b3a5`
