# An E2E that polls the open route as the creator never sees the document commit
- Date: 2026-10-18
- Inspired by: the E2E triage of the room-admission merge, `e2e/room-admission.spec.ts` `a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor` timing out at roomMode create
- Revisited: 2026-10-18 — fixed in the test: it waits for the editor text before polling (`3ec48b1`)
- Revisited: 2026-10-18 — still true

## Signal
A spec opens a fresh document as its creator, then polls the open route as the same user until the answer says Join. The poll runs for the whole timeout and the answer stays Create. The editor shows its text and the room never commits.

## Cause
Every open of an uncommitted document by the holder issues the next attempt and closes the older attempt's sockets with 4403. The poll is an open, so the first poll supersedes the editor's own socket before its seed commits, and each later poll does it again.

## Do
Wait for the editor text before the first poll, as the 10 MB test does, so the commit has landed and a poll no longer reserves. Poll as another user, who gets 409 without reserving, or read the update log when the spec must observe the room before the editor is ready.

## Anchor
- `e2e/room-admission.spec.ts:264`, commit `3ec48b1`
- `apps/server/src/collaboration/creator-reservations.ts` (`reserve`), `docs/features/room-admission/spec.md` (the holder opens the document twice)
