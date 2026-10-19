# An ownership check that closes the connection from a Hocuspocus hook still lets the message through
- Date: 2026-10-19
- Inspired by: the awareness ownership binding of [the frame entry cap feature](../features/awareness-frame-entry-cap/spec.md) and [ADR 0040](../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md)
- Revisited: 2026-10-19 — still true

## Signal

A forged awareness update is applied and broadcast, and the sender is closed only afterwards. A check on the awareness `update` event or a `connection.close()` inside `beforeHandleMessage` cannot stop the apply.

## Cause

`Connection.handleMessage` runs `beforeHandleMessage` and then applies the message in a `then`. Only a rejected promise skips the apply, and it closes the socket with the `code` and `reason` properties of the error. Frames that arrive before authentication are queued and replayed through the same method, so they reach the hook with the authenticated context, which the `ws` layer cannot give them.

## Do

Put a per-message authorization check in `beforeHandleMessage`. Throwing an error that carries `code` and `reason` stops the message and closes the socket, which is right for a structural breach. When the socket also carries document sync, drop the message instead: empty the frame in place (zero the awareness entry count) so Hocuspocus applies a no-op, and keep the socket open. Read the raw frame from `update` as a view (`Buffer.from(update.buffer, update.byteOffset, update.byteLength)`), never as a copy, because update frames can be 80 MiB.

## Anchor

`apps/server/src/collaboration/collaboration-server.ts` (`beforeHandleMessage`), `apps/server/src/collaboration/awareness-origin.ts` (`AwarenessOriginError`), `apps/server/src/collaboration/awareness-owners.ts`
