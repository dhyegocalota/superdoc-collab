# 0036. The superseded creator's page reads the close code from the socket

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the room-admission known limit (spec, "The holder opens the document twice"); `@hocuspocus/provider` 2.15.3 `HocuspocusProviderWebsocket.onClose`, which treats close code 4403 as retryable ("Will try again"); SuperDoc 2.23.0 `socket` on the `SuperDoc` instance.

## Context

ADR 0033 closes the sockets of a superseded creator attempt with 4403 and the reason `This attempt was superseded`. The server does that at once. The page learned of it 40 to 60 seconds later when it was already synced, and after about 74 seconds of silence when it was still loading. The delay is in the client library: the Hocuspocus provider treats a 4403 close as a transient failure and reconnects with exponential backoff (1, 2, 4, 8, 16, 30 s), each reconnect is refused again by `onAuthenticate`, and SuperDoc reports `failed` through `onCollaborationConnectionChange` only after that loop has run for a while. The user sees a page that looks alive while every keystroke is dropped by the fence.

## Decision

The page listens to the `close` event of the websocket SuperDoc creates (`superdoc.socket`, a `HocuspocusProviderWebsocket`). A close whose code is `SUPERSEDED_ATTEMPT_CLOSE_CODE` and whose reason is `SUPERSEDED_ATTEMPT_REASON` is reported at once as a failed transport with the new reason `ConnectionFailureReason.Superseded`, and the socket is disconnected so the provider stops retrying. Every other close code keeps today's path through SuperDoc's own state. The banner copy names the cause (the document was opened again in a newer tab) and keeps Reload as the one action; Reload returns 409 and the page waits for the new creator as before.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Listen to the socket close and map 4403 + reason (chosen) | signal in the same second; no server change; the code and reason are already shared constants | couples the page to `superdoc.socket`, which SuperDoc documents as set automatically and not part of its public config surface | — |
| Keep waiting for SuperDoc's `failed` state | no coupling | 40 to 60 s of a page that looks alive while edits are dropped; 74 s before ready | the user cannot tell the tab is dead |
| Close with 4401 on the server instead of 4403 | the provider stops retrying on 4401 | SuperDoc still reports nothing sooner, and 4401 means "session expired" in this codebase, so the banner would lie | wrong message, same delay |
| Patch or fork the provider's `onClose` | fixes the root cause | a vendored patch on a transitive dependency, lost on upgrade | maintenance cost for one event |

## Consequences

- The superseded tab shows the Failed banner within the second the takeover happens, synced or not.
- A unit test pins that `superdoc.socket` exists on the instance and that the listener is attached; a SuperDoc upgrade that removes the property fails that test instead of silently restoring the delay.
- The E2E "a holder who reopens a fresh document" now bounds the signal to seconds instead of accepting the large-commit timeout.

## Evidence

Measured on 2026-10-17 during the room-admission walk: the Failed banner appeared 40 to 60 s after the takeover on a ready page, and the editor notice after about 74 s of silence on a loading page. The provider's `onClose` at `@hocuspocus/provider` 2.15.3 returns early on `Forbidden.code` (4403) with the warning "Will try again".

## Revisit when

SuperDoc exposes the close code in `onCollaborationConnectionChange` or treats 4403 as final, or when the socket property leaves the `SuperDoc` instance.
