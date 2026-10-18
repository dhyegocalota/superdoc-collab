# Test plan: The superseded creator's page learns of the takeover at once

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/editor/superseded-close.test.ts::a 4403 close with the superseded reason is a failed report with the Superseded reason` — input: `{ code: 4403, reason: 'This attempt was superseded' }`; expected: `{ reading: Failed, failureReason: Superseded, hasSynced: false }`
- [ ] Confirmed it fails for the right reason: `supersededReportOf is not implemented`

## Unit

- [ ] `superseded-close.test.ts::a 4403 close with another reason is null` — input: `{ code: 4403, reason: 'Forbidden' }`; expected: `null`
- [ ] `superseded-close.test.ts::a 1006 close is null` — input: `{ code: 1006, reason: '' }`; expected: `null`
- [ ] `superdoc-editor.test.tsx::a superseded close reports Failed at once and disconnects the socket` — input: the mocked SuperDoc exposes `socket` with `on`, `off`, `disconnect`; emit `close` with `{ event: { code: 4403, reason } }`; expected: `onTransportReport` called once with the Superseded report, `disconnect` called once
- [ ] `superdoc-editor.test.tsx::another close code does not report` — input: emit `close` with code 1006; expected: `onTransportReport` not called, `disconnect` not called
- [ ] `superdoc-editor.test.tsx::the close listener is removed on unmount` — input: unmount; expected: `off('close', listener)` called with the same function
- [ ] `superdoc-editor.test.tsx::a superseded close before ready shows the editor notice` — input: close before any synced report; expected: `EDITOR_FAILED_MESSAGE` rendered and no transport report
- [ ] The Superseded copy renders in the banner with Reload — input: `state: Failed, failureReason: Superseded`; expected: "This document was opened again in a newer tab. Reload to follow it." and a Reload button
- [ ] `pnpm --filter @superdoc-collab/web test:unit` and `pnpm --filter @superdoc-collab/types test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/room-admission.spec.ts::a holder who reopens a fresh document supersedes its first page and the room holds one paragraph` — steps: Ana opens a fresh large document, the first socket sends a frame, Ana opens the same document in a second page; expected: within 10 s of the second open the first page shows the Failed banner with the Superseded copy or the editor notice; the second page commits; the room opens as Join with one paragraph set
- [ ] Red for the bound: on main the first page takes 40 s or more, so the 10 s wait fails (run once from a throwaway worktree at origin/main with the new spec, or record the measured delay from the gate log)

## Prove it for real — Playwright MCP

- [ ] Happy path: as Ana open a fresh 10 MB document, wait for the page to be ready, open the same document in a second tab (same browser); expected: the first tab shows the Failed banner with the Superseded copy within a few seconds, the second tab loads and commits
- [ ] Before ready: open a fresh document and reload it 2 s into the create; expected: the first page's editor notice appears at once, the reloaded page restarts the create
- [ ] Reload on the superseded tab: press Reload; expected: the waiting page or the committed document, no banner
- [ ] A normal outage is unchanged: stop the server with a ready page; expected: Reconnecting, then Back online after restart, never the Superseded copy
- [ ] Console and network clean: zero console errors other than the provider's own warning about the refused token, zero failed requests other than the expected 409
- [ ] Narrow width: 375 px; expected: the banner wraps, Reload fully visible, no horizontal scroll
- [ ] Screenshots at `.pr-media/superseded-signal/`; video at `.pr-media/superseded-signal/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the listener is attached before the first close can arrive — attack: find where SuperDoc assigns `socket`; result:
- [ ] Claim 2: no other close code is mapped to Superseded — attack: 4403 with another reason, 4401, 1009; result:
- [ ] Claim 3: disconnecting the socket on a superseded close cannot strand a legitimate reconnect — attack: the restart path of ADR 0033 (old epoch, 4403, same reason); result:

## Coverage honesty

What is not tested and why.

- The exact delay on main is recorded from the walk, not asserted by a test: the E2E asserts the new bound only.
