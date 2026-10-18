# The same user opening a fresh document in two pages leaves duplicated or missing content
- Date: 2026-10-17
- Inspired by: room-admission review of the holder's second open; the E2E `the holder opens a fresh document in two pages at once and the room holds one paragraph` (`fee812c`)
- Revisited: 2026-10-17 — fixed: a holder reopening gets the next attempt and the old attempt's sockets close with 4403 (`4541b89` red, `117b91f` green)

## Signal
One user opens the same new document in two tabs within a second. Both answers say Create with the same attempt, both pages seed the room, and the committed document holds the seed twice or one page's edits are lost. Two different users are protected, so the two-editor test passes.

## Cause
`CreatorReservations.reserve` is keyed by user. A second open by the holder returns the live attempt, so the fence, which compares only the attempt, sees two creators as one and cannot tell them apart. The rule "the holder's second tab is accepted" was chosen for reconnects and is wrong for a concurrent second creator.

## Do
Treat the newest open as the creator: every open of an uncommitted document by the holder issues the next attempt and supersedes the older one, whose sockets close with 4403 and whose writes are fenced. Reconnects of a page keep the attempt its open answer carried. Keep the two-pages E2E, and write the red test at the reservation unit level so it names the assertion.

## Anchor
- `apps/server/src/collaboration/creator-reservations.ts` (`reserve`, the `isLive && current.userId === userId` branch), `creator-reservations.test.ts`
- `e2e/room-admission.spec.ts`: `the holder opens a fresh document in two pages at once and the room holds one paragraph`
- `docs/features/room-admission/spec.md` (the holder opens the document twice within a second), `test-plan.md` (the two-pages row)
