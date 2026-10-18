# A hand-built collaboration socket in an E2E never authenticates on an uncommitted room, and its slow spec is skipped by default
- Date: 2026-10-17
- Inspired by: room-admission authentication refusal (`cf04805`) against the red E2E written before it (`ed459e0`)
- Revisited: 2026-10-17 — open for `holdCreatorSocket`, which still builds its URL from the path alone

## Signal
A spec that opens `new WebSocket(...)` in the page waits for an authenticated state that never arrives. The server logs a refusal for the room with no attempt. Existing server tests that use the collaboration client helper broke the same way in the same commit, with `The collaboration server refused the connection`.

## Cause
Since admission, `onAuthenticate` refuses a socket on an uncommitted room unless the upgrade URL carries the `attempt` and `epoch` queries of the open answer. The editor and the server test client add them. A raw socket in an E2E does not, and the 60 s expiry spec is gated behind `SLOW_ENVIRONMENT_VARIABLE`, so no default run notices.

## Do
Append the ticket to the URL the way `collaborationUrl` does: take `creatorAttempt` and `creatorEpoch` from the open answer and add them under `CREATOR_ATTEMPT_QUERY_KEY` and `CREATOR_EPOCH_QUERY_KEY`. Run the slow specs once before the PR opens, with the gating variable set, and record the run. A helper written before a rule lands needs a revisit when the rule lands.

## Anchor
- `e2e/room-admission.spec.ts` (`holdCreatorSocket`, `a superseded creator's socket closes with 4403 after the 60 s expiry`)
- `apps/web/src/features/editor/collaboration-config.ts` (`collaborationUrl`), `apps/server/src/testing/collaboration-client.ts` (`ticketQuery`)
- commits `ed459e0`, `cf04805`, `ae0c62f`
