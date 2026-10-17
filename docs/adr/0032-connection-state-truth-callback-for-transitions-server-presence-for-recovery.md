# 0032. Connection state truth: the SuperDoc callback for transitions, server presence for recovery

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/connection-state/brief.md` (approach B), `.claude/rules/collaboration.md`, the SuperDoc 2.23.0 collaboration docs ("Handle connection loss")

## Context

The editor must tell the user when their own connection is lost, when it is coming back and when it will not come back. SuperDoc reports connection changes through `onCollaborationConnectionChange` with the states lost, reconnecting, recovered and failed. A socket close of 4401 or 4403, or a permission denial, ends in failed and stops retries for the session. A worker transport failure ends in failed and also raises an exception with the code `worker-transport-failed`.

The proof of concept saw the callback report degraded across a server restart and never a recovery state, though sync had resumed (`.claude/rules/collaboration.md`). A banner driven by the callback alone would stay on forever after a restart.

The same exception event now also carries structured diagnostics with a severity of warn or error. Treating every exception as fatal, as the editor does today, turns a render hiccup into a dead editor.

## Decision

- `onCollaborationConnectionChange` sets Lost, Reconnecting and Failed the instant it fires.
- Recovered is set only when the members poll says the server sees this user online in the room and the callback has not said failed. A `synced` or `recovered` callback only triggers an immediate refetch of the members.
- Failed is final until the user presses Reload.
- There is no browser online flag and no heartbeat.
- The five states (Online, Lost, Reconnecting, Recovered, Failed) are an enum in `libs/types`.
- Exceptions are narrowed by payload shape. A diagnostic with severity warn is logged and does not change the state. A payload with `collaborationReason`, or with the code `worker-transport-failed`, is a failure.
- The members response gains a field that says whether the current user is online in the room, read from the live connections the server already holds.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Callback for transitions, server presence for recovery (chosen) | instant on loss; recovery confirmed by the party that matters | a second input to merge | n/a |
| Callback only | one input | never confirms recovery after a restart, the trap in the rules file | the banner would stay forever |
| Browser online flag plus a heartbeat | no server field | a second transport that can disagree with the real one; online does not mean the socket is up | it would show a state the editor does not have |
| A server-sent event stream for presence | push instead of poll | a new transport for one flag | cost far beyond the benefit |

## Consequences

- The members poll becomes part of the connection truth. A recovery is shown within one poll interval, shortened by the immediate refetch on a `synced` or `recovered` callback.
- If the poll itself fails while the callback says recovered, the banner stays on Reconnecting. The state never claims more than the server confirmed.
- The members response and its test grow by one field.
- A merge hook holds the table of callback state against server presence, and that table is the unit under test.

## Evidence

Added by the connection-state plan.

- A unit test of the exception narrowing: a warn diagnostic is logged, `collaborationReason` and `worker-transport-failed` are failures.
- A unit test of the merge table, callback state against server presence.
- A Playwright test that restarts the server mid-session and checks lost, then reconnecting, then a cleared banner.

## Revisit when

- SuperDoc reports a reliable recovered state across a restart, making server confirmation redundant.
- Presence needs more than one flag, which would justify a push channel.
