# Member presence

**Status:** Building
**Lane:** product
**Tier:** 🟢
**Owner approval:** approved 2026-10-18
**ADRs:** none
**Not changing:** the server, the members endpoint, the collaboration socket, the connection banner and the timeline query.

## Problem

The core-realtime scenario run on main on 2026-10-18 saw three defects.

1. After Dani signed out, Dani's avatar stayed in the headers of Ana and Bruno.
2. After a reload, Bruno appeared in Ana's list as "Go to Bruno's cursor" instead of "Bruno, online".
3. Right after Ana typed, her Edits panel said "No edits yet" until it re-rendered.

Root causes, read from the code:

1. The roster is the members query, polled every `MEMBERS_REFRESH_MS` (5 s). `online` is computed on the server from the open sockets. Sign-out already ends the socket: the page unmounts and `superdoc.destroy()` disconnects and destroys the provider. The server drops the connection at once, but a peer only learns it at its next poll, and nothing connects the peer's awareness (the remote caret vanishing) to that query. So a peer shows Dani online for up to one poll interval after Dani left. The fix does not need the server.
2. `Members` sets the accessible name of a button from two sources. With a rendered remote caret (`reason === null`) the name is `goToCursorLabel`; without one it is `memberLabel` ("Bruno, online"). Whether the caret has rendered by the time a reader looks depends on how the member got there (a reload paints carets late), so the same state gets two names.
3. `TimelineNotices` shows the empty copy whenever `bins` is empty. The first poll after Ana types succeeds with no bins while the projection is still behind the log (`projection.isBehind`), so a successful but not yet caught-up answer reads as "no edits".

## Goals

- A peer's avatar reflects a leave within moments of the awareness change, not at the next poll.
- One accessible-name rule on the member's state: `Name, online` when online, `Name` when offline. The jump affordance is the description, not the name.
- "No edits yet" shows only when the answer is empty and the projection is not behind.

## Non-goals

- Dropping offline members from the roster: the roster is the member list by design (offline members show as offline).
- A server change or a new endpoint.

## Design

### Data flow

1. `Members` derives the ids of the peers whose caret is rendered. The key changes only when that set changes, not when a caret moves, renames or recolours.
2. On a change it invalidates `membersQueryKey(documentId)` through a trailing debounce of `MEMBERS_PRESENCE_INVALIDATION_COOLDOWN_MS` (`libs/types`), with `cancelRefetch: false`, so a burst of awareness frames yields one invalidation and never cancels an in-flight members fetch or the 5 s poll.
3. Every member button is named by `memberLabel`; `aria-describedby` points at the jump text or the reason.
4. `TimelineNotices` adds `!projection.isBehind` to the empty condition.

### Interfaces

`Members` gains a required `documentId` prop, passed by `EditorHeader`. `useMemberCursors` is unchanged.

### Failure handling

An invalidation while the members query is in an error state refetches it, as the poll would.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Close the provider before sign-out navigates? | add a leave hook to the account menu; rely on the unmount that already closes it | rely on the unmount: it already runs `destroy()`; the staleness is the poll, not the socket | 2026-10-18 |
| Show the empty copy after "the first successful poll"? | first poll resolved; resolved and projection not behind | resolved and not behind: the first poll resolves empty while behind, which is the defect | 2026-10-18 |

## Test strategy summary

- Unit, red first: a peer caret leaving invalidates the members query; a jumpable member is named `Bruno, online`; the empty copy is absent while the projection is behind.
- Playwright MCP: the core-realtime scenario, sign-out of one author watched by the other.
