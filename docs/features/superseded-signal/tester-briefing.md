# Tester briefing: superseded-signal

Every "it works" below is a hypothesis for the tester to attack, not a result.

## What changed

- The page cannot read the takeover close: `superdoc.socket` is only ever `null` in SuperDoc 2.23.0 (`superdoc.es.js:46416`) and the provider runs in the collaboration worker. ADR 0036 takes the members poll instead.
- Server: `GET /api/documents/:id/members` accepts `attempt` and `epoch` (parsed by the shared `claimedTicketOf`, moved out of `collaboration-server.ts`) and answers `isAttemptSuperseded`. The rule lives in `DocumentRuntime.isAttemptSuperseded`: committed room plus another epoch is false, otherwise `!CreatorReservations.mayWrite`.
- Web: `fetchMembers` sends the opened document's creator ticket; `useMembers` returns `isAttemptSuperseded`; `DocumentPage` reports `SUPERSEDED_REPORT` through `reportTransport` when it turns true. The banner may show before the first sync, and the editor failure notice (`EDITOR_FAILED_MESSAGE`) is hidden while the reason is Superseded (`isSuperseded` prop of `SuperDocEditor`), because a later SuperDoc failure would otherwise ask to reload under a banner that offers no Reload.
- The members query key now ends with the ticket's attempt and epoch and uses `keepPreviousData`: a new ticket (in-app Reload, or a restarted server's epoch with the same attempt) fetches at once, and an answer fetched for the old ticket is never credited to the new one (`isPlaceholderData` forces `isAttemptSuperseded` false).
- Copy: reason "This document was opened elsewhere."; warning "Download first to keep your edits."; action "Back to documents" (navigates to the documents list). Reload is not offered for this reason.
- `connection-copy.test.ts`: the 40-character reason cap is unchanged: the neutral copy is 35 characters.
- E2E: `SUPERSEDED_SIGNAL_TIMEOUT_MS = 15_000` in `e2e/room-admission.spec.ts`; the holder-reopens test waits for the first page's editor and a frame before the second open, then expects the Failed banner with the Superseded copy and the Back to documents button.

## How to run

```
pnpm --filter @superdoc-collab/server exec vitest run src/documents/documents-routes.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/use-members.test.ts src/features/editor/connection-banner.test.tsx src/features/editor/connection-copy.test.ts src/features/editor/document-page.test.tsx
pnpm typecheck
```

The E2E spec is run by the lead's gate; the developer did not run it.

## Red today, green after

| Commit (red) | Test | Failure text the red run printed | Green |
|---|---|---|---|
| `d0ae878` | `superseded-close.test.ts` (3 tests) | `Error: supersededReportOf is not implemented` | `7ce7056`; the file and its tests were removed in `61fe56e` once the close-code route proved impossible (kept in history as the first attempt) |
| `0e6fb74` | `documents-routes.test.ts`: first attempt superseded after the holder reopens; another epoch on an uncommitted room; another epoch on a committed room; older attempt after a commit | `SyntaxError: Unexpected end of JSON input` (the runtime stub throws `isAttemptSuperseded is not implemented`, the route answers 500 with an empty body) | `73bf01b` |
| `61fe56e` | `use-members.test.ts`: request carries the ticket; `isAttemptSuperseded` follows the answer (2 tests) | `AssertionError: expected [ null, null ] to deeply equal [ '2', 'epoch-1' ]`; `AssertionError: expected false to be true` | `0d9117b` |
| `61fe56e` | `connection-banner.test.tsx`: superseded names the reason and offers the way back | `expect(element).not.toBeInTheDocument()` (the Reload button was still rendered) | `0d9117b` |
| `61fe56e` | `document-page.test.tsx`: poll carries the opened ticket; a superseded answer fails the page | `AssertionError: expected [ null, null ] to deeply equal [ '2', 'epoch-1' ]`; `Unable to find role="alert"` (twice) | `0d9117b` |
| `bf5f700` | `use-members.test.ts`: a new ticket fetches at once and the old answer is not credited | `expected "fetch" to be called 2 times, but got 1 times` | review-fix green commit |
| `707be63` | `use-members.test.ts`: a new epoch with the same attempt refetches and the old answer is not credited | `expected "fetch" to be called 2 times, but got 1 times` | this lane's next commit |
| `bf5f700` | `document-page.test.tsx`: a failure reported before ready after the superseded answer shows no editor notice | `expect(element).not.toBeInTheDocument()` (the notice was rendered) | review-fix green commit |

Pins (green when they landed): the six "unclaimed ticket is not superseded" rows in `documents-routes.test.ts`, and "a members poll that does not report a takeover leaves the page online" in `document-page.test.tsx`.

## Hypotheses to attack

1. The server rule equals the `connected` hook: a committed room ignores a ticket from another epoch; otherwise `mayWrite` decides. Attack: committed room with the committing attempt, an older attempt, a restart, a reader.
2. A request without a valid ticket is never superseded. Attack: duplicate `attempt` keys, a huge or negative attempt, an empty epoch.
3. The banner appears within about one poll (5 s, `MEMBERS_REFRESH_MS`) of the second open, synced or not. The very first poll of a page runs before the opened document is loaded and carries no ticket, so the first ticketed poll can be one interval late.
4. Back to documents does not strand a session and the older tab never reserves a new attempt. Attack: click it on a tab that is also the newest after a browser reload.
5. A normal outage still reads Reconnecting then Back online and never the Superseded copy, because only the ticket check produces the reason.
6. A transport `failed` snapshot already in the machine with reason Unknown is upgraded to Superseded by `failureReasonAfter`; a more specific earlier reason is kept.

## Security note

The members answer reveals only whether the caller's own attempt is current. The caller must already hold Reader on the document (`authorizedDocumentId`), the ticket already travels on the socket URL, and no other user's attempt or epoch is disclosed. The epoch is compared by equality; a mismatch on an uncommitted room answers `true`, which the socket upgrade would also refuse.

## Known gaps

- The delay bound is not instant: up to one poll interval, plus one more when the page's first poll preceded the opened document.
- The E2E bound starts after the first page's editor is mounted; it was not run by the developer.
- `superdoc.socket` was verified `null` by reading the dist, not by a live console check.
- The restart refusal and the other-user takeover are walk boxes only; no automated test drives them end to end.
- Reload on a superseded tab is intentionally absent; the user returns through the documents list and reopens, which reserves a new attempt.
