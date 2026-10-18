# Test plan: The superseded creator's page learns of the takeover within a poll

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/documents/documents-routes.test.ts::members answers that the first attempt is superseded once the holder reopens, and the newest is not` — input: the holder opens twice, then asks members with each ticket; expected: `isAttemptSuperseded` true for the first, false for the second
- [ ] Confirmed it fails for the right reason: the runtime stub throws `isAttemptSuperseded is not implemented`, the route answers 500 and the test reads an empty JSON body (`0e6fb74`)

## Unit

- [ ] `documents-routes.test.ts`: another epoch on an uncommitted room is true; another epoch on a committed room is false; an older attempt after a newer one committed is true
- [ ] `documents-routes.test.ts`: no ticket, an attempt without an epoch, an epoch without an attempt, attempt 0, 1.5 and `abc` are all false
- [ ] `use-members.test.ts`: the request carries `attempt` and `epoch` with a ticket and neither without; `isAttemptSuperseded` is false before the first answer, follows the latest answer, and is false after a failed poll
- [ ] `document-page.test.tsx`: the poll carries the opened ticket; a superseded answer shows the Failed banner with the Superseded copy before any sync, the editor inert, no editor notice; the Back to documents button navigates to the documents list and no Reload button exists
- [ ] `connection-banner.test.tsx`, `connection-copy.test.ts`: the Superseded reason, the download warning and the action label; every reason and warning fits the phone limits
- [ ] `pnpm --filter @superdoc-collab/web test:unit`, `pnpm --filter @superdoc-collab/server test:unit` and `pnpm --filter @superdoc-collab/types test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/room-admission.spec.ts::a holder who reopens a fresh document supersedes its first page and the room holds one paragraph` — steps: Ana opens a fresh large document, the first page mounts its editor and sends a frame, Ana opens the same document in a second page; expected: within 15 s the first page shows the Failed banner with the Superseded copy and a Back to documents button; the second page commits; the room opens as Join with one paragraph set
- [ ] Red for the bound: run the new spec once from a throwaway worktree at the red commit of the lane, or record the measured delay from the gate log; the first page took 40 s or more before the change

## Prove it for real — Playwright MCP

- [ ] Happy path: as Ana open a fresh 10 MB document, wait for the editor, open the same document in a second tab; expected: the first tab shows the Failed banner with the Superseded copy within about 5 s, the second tab loads and commits
- [ ] Before ready: open a fresh document and reload it 2 s into the create; expected: the first page shows the Failed banner within a poll or the editor notice, the reloaded page restarts the create
- [ ] Another user takes over after expiry (walk): the holder stays idle past the reservation expiry, an editor opens; expected: the holder's tab shows the Superseded banner within a poll
- [ ] Restart refusal (walk): stop and restart the server with a ready create page; expected: the refused page shows the Failed banner, with the neutral copy, within a poll of the restart
- [ ] Back to documents on the superseded tab: click it; expected: the documents list, the newer tab undisturbed
- [ ] Reload on the old tab while the second still creates (ADR 0033, newest wins): reload the first tab with the browser; expected: the old tab becomes the newest attempt and the second tab shows the Superseded banner
- [ ] A normal outage is unchanged: stop the server with a ready committed page; expected: Reconnecting, then Back online after restart, never the Superseded copy
- [ ] Console and network clean: zero console errors other than the provider's own warning about the refused token, zero failed requests other than the expected 409
- [ ] Narrow width: 375 px; expected: the banner wraps, Back to documents fully visible, no horizontal scroll
- [ ] Screenshots at `.pr-media/superseded-signal/`; video at `.pr-media/superseded-signal/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the server rule matches the `connected` hook — attack: committed room with an old epoch, committed room with the committing attempt, uncommitted room after a restart; result:
- [ ] Claim 2: no ticket-less or malformed request is ever superseded — attack: duplicate query keys, a huge attempt, an epoch with encoded characters; result:
- [ ] Claim 3: Back to documents cannot strand a legitimate session — attack: a tab that is superseded and then committed by the newer attempt, a reader's page; result:

## Coverage honesty

What is not tested and why.

- The exact delay before the change is recorded from the walk, not asserted by a test: the E2E asserts the new bound only.
- The first poll on a page runs before the opened document carries a ticket, so the first ticketed poll is at most one interval late; no test pins that interval.
