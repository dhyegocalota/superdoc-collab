# 0036. The superseded creator's page learns of the takeover from the members poll

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the room-admission known limit (spec, "The holder opens the document twice"); `@hocuspocus/provider` 2.15.3 `HocuspocusProviderWebsocket.onClose`; SuperDoc 2.23.0 (`superdoc.es.js:46416`) and `@superdoc/docx-engine` 0.22.0 collaboration worker.

## Context

ADR 0033 closes the sockets of a superseded creator attempt with 4403 and the reason `This attempt was superseded`. The server does that at once. The page learned of it 40 to 60 seconds later when it was already synced, and after about 74 seconds of silence when it was still loading. Until then the tab looks alive while every keystroke is dropped by the fence.

The page cannot read the close. In SuperDoc 2.23.0 the `socket` property of the instance is only ever assigned `null` (`superdoc.es.js:46416`); the v2 Hocuspocus provider and its websocket live in the collaboration worker, and the page receives connection snapshots whose only detail is `transport-disconnected`. No close code or reason reaches the main thread.

## Decision

The members poll, which the page already runs every `MEMBERS_REFRESH_MS`, carries the creator ticket the page holds (`attempt` and `epoch` query parameters, parsed by the parser the socket upgrade uses). The server answers `isAttemptSuperseded`, true when the ticket would be refused by the rule the `connected` hook applies: a committed room ignores a ticket from another epoch, otherwise the attempt must be the one `CreatorReservations.mayWrite` accepts. A page that sends no ticket, or a malformed one, is never superseded.

The page maps `isAttemptSuperseded === true` to a Failed report with the new reason `ConnectionFailureReason.Superseded` through the existing connection state. Because the signal comes from the poll and not from the editor, it may show the Failed banner before the first sync; this is an explicit exception to the connection-state rule that the banner applies after the first sync, because the tab has a clear action.

The copy is neutral, because the same ticket check also covers another user's takeover after expiry, an abandoned creator returning after someone else committed, and a refused reconnect after a restart: "This document was opened elsewhere." The action is "Back to documents", not Reload: a Reload on the holder's old tab would reserve a new attempt and supersede the newer tab in turn (newest wins, ADR 0033), a ping-pong.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Members poll carries the ticket (chosen) | no dependency on SuperDoc internals; reuses a poll and the server's own fence rule; bound of one poll interval | up to 5 s instead of instant; one more query parameter | — |
| Listen to `superdoc.socket` close | instant | the property is always `null` on the v2 path; the provider runs in the collaboration worker (`superdoc.es.js:46416`) | cannot work |
| Wait for SuperDoc's own `failed` | no code | 40 to 60 s of a page that looks alive while edits are dropped; 74 s before ready | the user cannot tell the tab is dead |
| Close with 4401 instead of 4403 | the provider stops retrying on 4401 | 4401 means "session expired" in this codebase, so the banner would lie; the page still receives no code | wrong message, same visibility problem |
| A page channel such as server-sent events | instant | a second long-lived connection and a new route for one signal | larger than a field on an existing poll |
| Patch or fork the provider | fixes the root cause | a vendored patch on a transitive dependency, lost on upgrade | maintenance cost for one event |

## Consequences

- The superseded tab shows the Failed banner within one poll interval, synced or not.
- The members response gains `isAttemptSuperseded`. It reveals only whether the caller's own attempt is current; the ticket already travels on the socket URL.
- The answer is per document, not per user: a member who knows the process epoch (any upload of their own reveals it) can probe attempt numbers on another document they can read and learn that document's latest attempt number and when a new one is issued. It gives no read, write or takeover advantage, because the socket still requires the attempt to belong to the user. Answering only for the caller's own issued attempts would close this, but needs a per-user record of attempts; not taken.
- Reload is not offered on a superseded tab, so two tabs of one holder cannot supersede each other in a loop by the banner's action.
- A ticket from a restarted server (another epoch on an uncommitted room) shows the same banner, which matches the refusal the socket gets.

## Evidence

Measured on 2026-10-17 during the room-admission walk: the Failed banner appeared 40 to 60 s after the takeover on a ready page, and the editor notice after about 74 s of silence on a loading page. `superdoc.es.js:46416` assigns `this.socket = null`; no other assignment exists in 2.23.0. The worker's Hocuspocus adapter calls its failure hook on close codes 4401 and 4403 but forwards no code to the page.

## Revisit when

SuperDoc exposes the close code in `onCollaborationConnectionChange` or the instance exposes the socket again, which would make the signal instant, or when the members poll moves to a push channel.
