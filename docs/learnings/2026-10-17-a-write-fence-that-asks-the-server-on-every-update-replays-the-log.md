# Typing in a half-created room stalls the server because each update reads the update log
- Date: 2026-10-17
- Inspired by: room-admission review; `5d11020`, `f4c4745`, `bc26598`
- Revisited: 2026-10-17 — still true

## Signal
While a creator seeds a large document, every other request on the server is slow and the process spends its time decoding Yjs. The update log is read once per creator update.

## Cause
The write fence trusted the server's committed state as well as the live room marker, because any member can overwrite the marker. Consulting that state on every update of an uncommitted room made each creator update re-apply the whole partial log on the main thread, so the work repeated for every update of the seed.

## Do
Branch on the attempt before anything else. A socket that carries an attempt is checked by `mayWrite` alone, which is a map lookup. Only a socket with no attempt consults the live marker and `bootstrap.isCommitted`. Pin it with a test that spies on the log and the snapshots and asserts zero reads for a creator update.

## Anchor
- `apps/server/src/collaboration/collaboration-server.ts` (the `onChange` fence), `creator-reservations.ts` (`mayWrite`)
- `collaboration-server.test.ts`: `a creator update on an uncommitted room never queries the log or the snapshots`
- commits `5d11020` (introduced), `f4c4745` (fixed), `bc26598` (test)
