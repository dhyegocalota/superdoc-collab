# An expired session leaves the editor reconnecting forever instead of showing failed
- Date: 2026-10-17
- Inspired by: room-admission second review round and security round; `fa73e5c`, `5494f38`
- Revisited: 2026-10-17 — still true

## Signal
After the session expires, the connection banner cycles through reconnecting and never reaches failed, and the server log shows a new upgrade attempt every few seconds. A different run logs the provider's own "token" complaint when the close reason is the word Unauthorized.

## Cause
The Hocuspocus provider treats a destroyed upgrade (no WebSocket ever opens) as a network drop and retries without limit. A completed upgrade closed with 4401 is read as an authentication failure and stops the retries. A close reason equal to Hocuspocus's own `Unauthorized` makes the provider run its token handling and log its message, so the reason must differ.

## Do
Check the session before `handleUpgrade`. A session that is missing from the store completes the upgrade and closes with `UNAUTHORIZED_CLOSE_CODE` and `UNAUTHORIZED_CLOSE_REASON` (`Session expired`). A request with no cookie, or a lookup that throws, is destroyed, because that may be a transient server fault and the provider should retry. Never put the lookup error in the close reason.

## Anchor
- `apps/server/src/collaboration/attach-collaboration.ts` (`upgradeMember`, `refuseSession`), `libs/types/src/constants.ts` (`UNAUTHORIZED_CLOSE_CODE`, `UNAUTHORIZED_CLOSE_REASON`)
- `attach-collaboration.test.ts`: `a browser whose session expired is closed with 4401 and never reaches Hocuspocus`, `a session lookup that throws destroys the connection instead of closing with 4401`
- commits `fa73e5c`, `bf763b3`, `5494f38`, `87a3c33`
