# One awareness frame is bounded by 64 entries before Hocuspocus decodes it

**Status:** Building
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18
**ADRs:** [0040](../../adr/0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md) (amended in place)
**Not changing:** the two frame-rate buckets and their figures, the payload cap, one document per socket, close code 1008, the declarer, and the rate limits of the version-room sockets (the entry check wraps them too, harmlessly).

## Problem

[PR #59](https://github.com/dhyegocalota/superdoc-collab/pull/59) bounded an awareness frame by closing a connection that holds more than `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION` (8) client ids from `onAwarenessUpdate`. Two reviews after the merge showed with a script against the real Hocuspocus 2.15.3 `Document` that the hook runs too late and leaves a route around it.

- **Too late.** `onAwarenessUpdate` fires after Hocuspocus has decoded every claimed id, stored every state, added the ids to `connection.clients` and broadcast all of them to every member. The close then broadcasts the removals again. One frame up to the 80 MiB payload cap costs its size times the members, twice, before the 1008.
- **Replay.** `removeAwarenessStates` deletes the states of a closed connection but keeps `awareness.meta` for remote ids. A second connection from the same member that resends the ids at a higher clock has them filed under `updated`, not `added`. They never join its `clients`, so the cap never trips, and the states survive that connection's close for the 30 s outdated window, refreshable with one frame every 25 s. After that every awareness frame in the room pays Hocuspocus' eager `awarenessStatesToArray` for the hook payload, about 3 ms per frame at 100,000 states.

## Goals

- A frame that claims more than 64 entries closes its socket before Hocuspocus decodes anything.
- A replayed id leaves with the connection that replayed it, and a connection that touches an id another connection holds is closed.
- Ordinary providers (typing, the pause flush, reconnects, leaving, the relays of the stock provider) are never closed.

## Non-goals

- Bounding the number of sockets a member can open (see the known gaps).
- Changing the rate buckets or the declarer.

## Design

### Data flow

1. `awarenessEntryCountOf` in `apps/server/src/collaboration/frame-bucket.ts` reads, for an awareness frame, the two varints after the message type (the payload length, then the entry count), with a reader that looks at most six bytes deep per varint, because the decoder behind the `ws` layer accepts padding of any length and a five-byte reader would let a padded varint fall into the update bucket uncounted, while scanning to the end of the varint would cost a whole 80 MiB frame twice (once in the wrapper, once in the rate limit). It returns `null` for a frame that is not awareness or whose header is truncated, and `UNREADABLE_ENTRY_COUNT` (infinity) when the room name length or the message type is still continuing at its sixth byte, or when an awareness frame's message type, payload length or entry count is longer than five bytes or truncated, so the cap closes it. It has no throw path.
2. `SocketMessageLimit.claimsTooManyEntries` is true when that count exceeds `MAX_AWARENESS_ENTRIES_PER_FRAME` (64, its own constant: the stock provider relays every change it applies, one entry per changed peer, so a join into a room holding N states or N peers leaving at once sends N entries). `attach-collaboration.ts` wraps the `emit` of every collaboration socket (version-room sockets too, harmlessly): a `message` event whose frame claims too many entries is withheld from every listener (the emitter would otherwise hand the frame to Hocuspocus' receiver, which runs after the counting listener), the listeners are removed, and the socket closes with 1008 and `SOCKET_AWARENESS_ENTRIES_REASON`. A frame whose header is truncated passes through to the buckets as today.
3. The same wrapper checks that the entries of a frame whose count is at most 64 are well formed (`awarenessEntryCountOf`): per entry the client id varint, the clock varint (up to eight bytes) and the length of the state, which it skips, in one allocation-free pass. A malformed entry (an id or state length over five bytes, a state running past the frame) closes with the entries reason. One warn line per close.
3b. `AwarenessOwners` in `apps/server/src/collaboration/awareness-owners.ts` binds each awareness client id, per document, to the user whose connection first announced it (the `added` ids of the awareness `update` event, bound in `closeSendersOfForeignIds`). The binding survives socket closes and is forgotten in `afterUnloadDocument`. `beforeHandleMessage` in `collaboration-server.ts` reads the entries of the frame (`awarenessEntriesOf`) and, when one targets an id bound to another user at a clock above the room's held clock for that id (`document.awareness.meta`), empties the frame in place (`silenceAwarenessEntries` zeroes its entry count, so Hocuspocus applies an update of no entries) and logs one `AWARENESS_DROP_LOG` warn line per socket per minute (`KeyedCooldown`). The sender keeps its socket: closing it would cost the document sync that shares the socket, and a poisoned binding must cost presence only. Only the structural breaches close (entry count, header varints, malformed entries, the ids cap). When a room loads, the binding is seeded from the recorded client identities of the document (`client_identities`, written from the updates each connection appends and from the declarer), so a victim's id stays bound to the victim across unloads and restarts. An id with no recorded identity is bound first-come. A connection past the ids cap binds none of the ids of its frame. It runs after authentication, so it also covers frames queued before it. A relay at the held clock or below passes: `applyAwarenessUpdate` ignores a non-null state at a clock it holds, so the room files it as no change. A user's own ids pass at any clock and an unbound id is adopted. An absolute clock ceiling was built first and rejected, see ADR 0040: any member could make the victims' providers bump to the ceiling and be closed by it. A clock of 2 to the 52 is unreachable honestly (the clock advances by one per update, renewal or re-assert and restarts on each page load; about 28,500 years at the frame cap).
4. `closeSendersOfForeignIds` in `apps/server/src/collaboration/awareness-origin.ts` is registered on the awareness `update` event when a document loads (`afterLoadDocument`). Its origin is the sender's websocket. An id in `updated` that the sender does not hold and no other connection holds joins the sender's `clients`: the existing cap counts it and the close removes its state. An id in `updated` that another connection of the same user holds moves to the sender (it leaves the old connection's `clients`): the provider keeps its client id across reconnects and the server may hold the old half-open socket for about 20 s. An id in `updated` that a connection of another user holds closes the sender with 1008 and `SOCKET_AWARENESS_ORIGIN_REASON`. A `removed` id never closes the sender: Hocuspocus has already applied the removal and the owner's provider re-asserts its state, and the stock provider 2.15.3 relays removals of every remote state when it closes, queues them while its socket is null and flushes them after the reconnect, so a legitimate reconnecting peer sends removals of ids other connections hold. Updates from no connection (the outdated timeout, the close cleanup) are ignored. A relay of a peer's state at the clock the room already holds is filed as neither added, updated nor removed, so the event does not fire for it and the relays of the stock provider stay open.
5. `onAwarenessUpdate` keeps closing a connection that accumulates more than `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION` (8) ids over several frames with `SOCKET_AWARENESS_IDS_REASON`.

The constants are `MAX_AWARENESS_CLIENT_IDS_PER_CONNECTION` (existing), `MAX_AWARENESS_ENTRIES_PER_FRAME` (with an `// NB ADR 0040:` pointer), `SOCKET_AWARENESS_ENTRIES_REASON` and `SOCKET_AWARENESS_ORIGIN_REASON`, in `libs/types/src/constants.ts`.

### Why the origin check adopts instead of closing every unowned id

The first design closed any sender whose `updated` id is not in its own `clients`. A test showed it also closes a provider that reconnects while the room stays loaded: Hocuspocus keeps the meta of the old socket's ids, so the reconnect is filed under `updated` as well. Adoption closes the replay the same way (the replayed states are removed at the replayer's close, and more than eight of them trip the cap) and leaves the reconnect alone. Only an id another live connection holds is refused.

### Failure handling

A closed socket is the whole response. The provider reconnects and, being legitimate, resends its own id. Each close (entries, ids, origin) writes one warn line without payload; once a socket is closed for an overclaim, every later message on it is dropped without a line.

### Known gaps for the owner

- **A room holding more than 64 awareness states closes a provider that joins it.** The stock provider relays every awareness change it applies, one entry per changed peer. The server ignores a relayed state at the clock it holds, but the frame carries the entries, so a join into a room of more than 64 states, or more than 64 peers leaving at once, is closed with `SOCKET_AWARENESS_ENTRIES_REASON`. Rooms of up to 64 simultaneous providers are unaffected. Raising the cap is an owner decision.
- **A thrown close from `beforeHandleMessage` is noisy.** Hocuspocus prints its own error output with a stack trace, about nine lines, for each structural close raised there, on top of our one warn line. A quieter close path or a logger filter is an owner follow-up.
- **A fresh id a user adopts stays bound after their socket is gone.** By design: the binding outlives the connection until the room unloads (and the recorded identity outlives that), so another user announcing it is dropped, not closed.
- **An equal-clock removal by another user is applied.** It is indistinguishable from the relay the stock provider sends when it reconnects, so a member can drop a peer's presence until the peer's next update re-asserts it; a sustained attacker can keep a peer's presence blank, bounded by the frame rate cap. A forged update of a bound id at a higher clock is dropped before the apply.
- **Binding poisoning is possible for an id with no recorded identity.** The binding is first-come, so an attacker who reconnects first after a room unloads and announces the id of a victim's open page (every awareness broadcast reveals it) binds it to itself, and the victim's frames for it are then dropped until the victim reloads the page. It costs the victim's presence, never the document sync, because a refused frame is dropped and the socket stays open. Seeding from the recorded identities closes it for every id that has been recorded, which is every id whose owner has typed.
- **Fresh ids with a null state grow `awareness.meta`.** Canonical frames of 64 fresh ids with a null state, at the frame rate cap, add about 320,001 `meta` entries and 32.7 MB of heap per second, with no event for the checks to see; the outdated walk then scans them. The same `ws`-layer check of entry client ids against the socket's own ids closes it.
- **Unbounded sockets per user.** A member can open any number of sockets, each holding up to eight ids. This stays the owner follow-up named in ADR 0040.
- **A typing run followed by a pause can still breach the update bucket.** The tester saw a 15 s uninterrupted typing run followed by a pause close Ana's socket with the update-bucket breach in 2 of 3 runs, about 1344 frames in the next second, at the edge of the 1000 per second cap of PR #59. The provider reconnected at once. Raising the cap is an owner decision.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Close or adopt an unowned `updated` id | close every one; adopt the unclaimed and close the foreign | Adopt the unclaimed, close the foreign (developer's finding, reconnect test) | 2026-10-18 |
| Id held by another socket of the same user | close the sender; move the id to the sender | Move it, because a reconnect overlaps the old half-open socket for about 20 s (reviewer's finding) | 2026-10-18 |
| Value of the frame entry cap | reuse the 8 ids per connection; its own constant of 64 | Its own constant of 64, because the stock provider's relays carry one entry per changed peer (lead's decision after the relay finding) | 2026-10-18 |

## Test strategy summary

- Unit (red first): `awarenessEntryCountOf` and `claimsTooManyEntries`; end to end through `attachCollaboration`: 65 entries close with the entries reason and the room's `awareness.meta` never gains the ids, the frame never reaches the room handler, 64 entries reach it and the socket stays open, nine ids in one frame and ids claimed over two frames close with the ids reason, eight entries pass, a flood of awareness frames still closes at 5001.
- Origin: ids replayed by a second connection are removed at its close; updating a bound id of another user at a higher clock is dropped before the room applies it and the sender keeps its socket, and a 2 to the 53 clock is dropped the same way; a removal of a held id, as a reconnect queue sends, keeps the sender open; a provider updating or removing its own id, one relaying a held state at the held clock and one reconnecting while the room stays loaded keep their sockets.
- Walk by a tester: see the test plan.
