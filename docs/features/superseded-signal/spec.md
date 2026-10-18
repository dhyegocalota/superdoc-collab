# The superseded creator's page learns of the takeover within a poll

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 ("ok fix isso", after the explanation of the 40 to 60 s delay); route and copy refined by the lead the same day after the plan review.
**ADRs:** [0036](../../adr/0036-the-superseded-creator-page-learns-of-the-takeover-from-the-members-poll.md)
**Not changing:** the server's takeover close (ADR 0033); the provider's reconnect policy; the 409 waiting page.

## Problem

When the holder of an uncommitted room opens the document again, the server closes the first tab's socket with 4403 and the reason `This attempt was superseded` at once, but the first tab shows the Failed banner only 40 to 60 s later (or the editor notice after about 74 s when it was still loading). The page cannot read the close: `superdoc.socket` is always `null` in SuperDoc 2.23.0 (`superdoc.es.js:46416`) and the provider runs in the collaboration worker. Until then the tab looks alive while every keystroke is dropped by the fence.

## Change

- `libs/types`: `ConnectionFailureReason.Superseded`; `DocumentMembers.isAttemptSuperseded`.
- Server: `GET /api/documents/:id/members` reads `attempt` and `epoch` from the query with the parser the socket upgrade uses (`claimedTicketOf`, now shared) and answers `isAttemptSuperseded`. `DocumentRuntime.isAttemptSuperseded` applies the `connected` hook's rule: on a committed room a ticket from another epoch is ignored (not superseded); otherwise the attempt is superseded when `CreatorReservations.mayWrite` refuses it. No ticket, a missing half, a non-integer or non-positive attempt: `false`.
- Web: `fetchMembers` sends the opened document's creator ticket; `useMembers` returns `isAttemptSuperseded` (false before the first answer and after a failed poll); `DocumentPage` reports `SUPERSEDED_REPORT` through `reportTransport` when it turns true. This path is outside the editor's readiness rule, so the Failed banner may show before the first sync: an explicit exception to the connection-state rule "the banner applies after the first sync", because the tab has a clear action. The editor is inert under the banner as for any Failed state.
- Copy: reason "This document was opened elsewhere and this tab stopped syncing." (neutral: it also covers another user's takeover after expiry, an abandoned creator returning after a commit, and a refused reconnect after a restart); the warning is "Download first to keep your edits."; the action is "Back to documents", which navigates to the documents list. Reload is not offered: it would reserve a new attempt and supersede the newer tab (ADR 0033), a ping-pong.
- Docs: the room-admission spec drops the known limit and corrects the restart line; the connection-state spec lists the reason.

## Tests

- Server `documents-routes.test.ts` (red first): the first attempt is superseded once the holder reopens and the newest is not; another epoch on an uncommitted room is superseded; another epoch on a committed room is not; an older attempt after a commit by a newer one is superseded; no ticket, half a ticket, zero, fractional and non-numeric attempts are not.
- Web `use-members.test.ts`: the request carries the ticket (and none without one); `isAttemptSuperseded` follows the latest answer and is false after a failed poll.
- Web `document-page.test.tsx`: the poll carries the opened ticket; a superseded answer shows the Failed banner with the Superseded copy before any sync and makes the editor inert; the action is Back to documents and navigates to the documents list, with no Reload.
- Web `connection-banner.test.tsx`, `connection-copy.test.ts`: the Superseded reason, warning and action; phone length limits.
- E2E `room-admission.spec.ts::a holder who reopens a fresh document supersedes its first page and the room holds one paragraph`: with the first page's editor mounted and a frame sent, the second open makes the first page show the Failed banner with the Superseded copy and the Back to documents button within `SUPERSEDED_SIGNAL_TIMEOUT_MS` (15 s) instead of the 120 s large-commit timeout.
