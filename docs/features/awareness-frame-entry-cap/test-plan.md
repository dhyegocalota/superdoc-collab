# Test plan: One awareness frame is bounded by 64 entries before Hocuspocus decodes it

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `socket-message-limit.test.ts::an awareness frame claiming one entry more than the frame cap claims too many` — input: a frame claiming 65 entries; expected: `claimsTooManyEntries` is true. Red at the first commit of the lane: `claimsTooManyEntries is not implemented`.
- [ ] `attach-collaboration.test.ts::an awareness frame claiming one entry more than the frame cap closes the socket with 1008 before the room decodes it` — input: a provider's socket sends a frame claiming 65 entries; expected: close 1008 with `SOCKET_AWARENESS_ENTRIES_REASON`, and no claimed id in the room's `awareness.meta`. Red: the reason received was `Too many awareness clients on one connection`.
- [ ] `attach-collaboration.test.ts::ids a closed connection left behind and a second connection replays leave with that second connection` — red when the second commit of the lane landed.
- [ ] `attach-collaboration.test.ts::a connection updating an awareness id that another live connection holds is closed with the origin reason` and `::a connection removing an awareness id that another live connection holds is closed with the origin reason` — red when the second commit of the lane landed.
- [ ] Confirmed each fails for the right reason: the failure texts are in `tester-briefing.md`.

## Unit

- [ ] `frame-bucket.test.ts::the entry count of an awareness frame is the count the payload declares` — input: frames claiming 0, 1, 9 and 300 entries; expected: 0, 1, 9, 300.
- [ ] `frame-bucket.test.ts::the entry count is read behind a multi-byte room name length and payload length` — input: a 300-byte room name and 20 entries; expected: 20.
- [ ] `frame-bucket.test.ts::the entry count of a frame delivered as fragments is read the same way` — input: nine entries split in two fragments; expected: 9.
- [ ] `frame-bucket.test.ts::a frame that is not awareness has no entry count` — input: a sync step one frame and an auth frame; expected: `null`, `null`.
- [ ] `frame-bucket.test.ts::a truncated or unterminated count has no entry count` — input: a frame cut after the message type, after the payload length, a count of five continuation bytes and a one-byte frame; expected: `null` for each, no throw.
- [ ] `socket-message-limit.test.ts::awareness frames claiming up to the frame cap, other frames and unreadable frames do not` — input: 64 entries, an empty awareness frame, a sync frame and one byte; expected: all false.
- [ ] `attach-collaboration.test.ts::an awareness frame claiming exactly the connection cap of client ids keeps the socket open` (a pin) — input: eight entries; expected: socket open, states recorded.
- [ ] `attach-collaboration.test.ts::a frame claiming exactly the frame cap of entries reaches the room handler and keeps the socket open` (a pin) — input: 64 entries on a counted socket; expected: the room handler called once, socket open.
- [ ] `attach-collaboration.test.ts::one frame claiming one client id more than the connection cap closes the socket with the client ids reason` — input: nine ids in one frame (under the frame cap); expected: close 1008 with `SOCKET_AWARENESS_IDS_REASON`.
- [ ] `attach-collaboration.test.ts::claims split over frames that together pass the connection cap close the socket with the client ids reason` (a pin) — input: two frames of five ids; expected: close 1008 with `SOCKET_AWARENESS_IDS_REASON`.
- [ ] `attach-collaboration.test.ts::the frame claiming too many entries never reaches the room handler and nothing after it does` — input: 65 entries then an empty awareness frame on a counted socket; expected: close 1008, the room handler called zero times.
- [ ] `attach-collaboration.test.ts::the awareness frame past its own cap closes the socket with 1008 and nothing after it is read` (existing) — input: 5010 empty awareness frames; expected: close 1008 and the room handler called 5001 times.
- [ ] `attach-collaboration.test.ts::ids a closed connection left behind and a second connection replays leave with that second connection` — input: connection A claims five ids and closes, connection B resends them at clock 2 with a third provider keeping the room loaded, then B closes; expected: the states exist while B is open and none after B closes; the third provider stays open.
- [ ] `attach-collaboration.test.ts::a connection updating an awareness id that another live connection holds is closed with the origin reason` and `::a connection removing an awareness id that another live connection holds is closed with the origin reason` — input: a holder claims five ids, a second connection updates them at clock 2, in the other test removes them at clock 2; expected: the second connection closes with 1008 and `SOCKET_AWARENESS_ORIGIN_REASON`, the holder stays open.
- [ ] `attach-collaboration.test.ts::a connection relaying an awareness state at the clock the room already holds keeps the socket open` — input: a holder claims five ids at clock 1, a second connection resends them at clock 1 and then sets its own cursor; expected: the cursor reaches the room, both sockets stay open (the clock plus one case is the foreign-id test above).
- [ ] `attach-collaboration.test.ts::a connection updating its own awareness id keeps the socket open` (a pin) — input: five cursor updates by a provider; expected: socket open, one state.
- [ ] `attach-collaboration.test.ts::a connection removing its own awareness id on leave keeps the socket open` (a pin) — input: a provider sets then clears its local awareness state; expected: state removed, socket open.
- [ ] `attach-collaboration.test.ts::a provider that reconnects and resends its own awareness id keeps its new socket open` (a pin that was red against the first origin design) — input: a provider drops its socket and reconnects while a second provider keeps the room loaded, then sets a cursor; expected: the cursor reaches the room and the new socket is open.

## Prove it for real

The tester drives the walks below on a stack of the branch. The developer never runs them.

- [ ] Ana and Bruno type at 50 keys per second for ten seconds, then pause; expected: no "too many awareness entries" line in the server log, no reconnect, no close.
- [ ] A raw authenticated socket sends one awareness frame claiming 65 entries; expected: close 1008 `Too many awareness entries in one frame`, and Ana's presence list shows none of the nine claimed ids at any moment.
- [ ] A raw socket claims 64 entries at clock 1 for ids nobody holds, then closes; expected: the entries cap does not close it (the ids cap of eight does, with `Too many awareness clients on one connection`), and none of its ids remain.
- [ ] A raw socket claims eight entries; expected: stays open.
- [ ] Replay: raw socket A claims ids 1 to 5 and closes; raw socket B, same user, resends them at clock 2; expected: B stays open, the states exist, and none remain after B closes; then raw socket C updates an id held by a live socket D; expected: C closed with 1008 `Awareness client not owned by this connection`.
- [ ] Ana's provider reconnects (offline then online) in a room Bruno keeps open; expected: Ana's socket stays open and her cursor reappears for Bruno.
- [ ] A room of nine tabs: expected: every tab joins and stays open, because the relays carry at most eight entries.
- [ ] A room of 65 providers is the known gap and is not walked.
- [ ] Console and network clean for Ana and Bruno apart from the expected closes.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.
