# A per-connection awareness id cap never trips for ids replayed after their first connection closed

- Date: 2026-10-18
- Inspired by: two reviews of the socket frame cap lane after [PR #59](https://github.com/dhyegocalota/superdoc-collab/pull/59) merged, each reproduced with a node script against the real Hocuspocus 2.15.3 `Document` ([ADR 0040](../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md))
- Revisited: 2026-10-18 — still true

## Signal

A connection holding more than eight awareness client ids is closed by the hook, yet a second connection from the same member that resends the same ids is never closed. The room's awareness keeps their states after that connection closes, refreshed by one frame every 25 s, and every awareness frame in the room then pays for a rebuild of the full state list. A single frame claiming a million ids also costs the server a decode, a store and a broadcast per id before any hook sees it.

## Cause

Hocuspocus removes the states of a closed connection but keeps `awareness.meta` for remote ids. A replay at a higher clock is therefore filed under `updated`, not `added`, and only `added` ids join `connection.clients`, which is what the cap and the close cleanup read. A reconnecting provider is filed the same way while the room stays loaded, so closing every sender with an id outside its own `clients` also closes honest reconnects. A hook such as `onAwarenessUpdate` runs after Hocuspocus has decoded, stored and broadcast every claimed state, and its payload carries no origin; the origin is the second argument of the awareness `update` event. The stock provider also relays every awareness change it applies, other peers' ids included, so the entry count of a frame says nothing about how many ids its sender owns.

## Do

Bound an awareness frame at the `ws` layer by its entry count, before Hocuspocus reads it. Do the ownership check on the awareness `update` event, where the origin is known: adopt an id nobody holds into the sender so the cap counts it and the close removes it, and close the sender only for an id another connection holds. Test the check with a room kept loaded by a third provider, because a room that unloads forgets the meta and hides the replay.

## Anchor

`apps/server/src/collaboration/frame-bucket.ts` (`awarenessEntryCountOf`), `apps/server/src/collaboration/awareness-origin.ts`, `apps/server/src/collaboration/attach-collaboration.test.ts` (the replay, foreign id and reconnect tests), ADR 0040, [the feature](../features/awareness-frame-entry-cap/spec.md)
