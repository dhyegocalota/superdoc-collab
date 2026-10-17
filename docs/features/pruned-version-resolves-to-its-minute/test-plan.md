# Test plan: A pruned version sequence resolves to its minute

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `libs/history/src/version-marks.test.ts::a sequence whose mark was pruned resolves to the surviving mark of its minute` — input: marks at minutes 0 (bootstrap, 3), 1 (9), 2 (14); sequence 12 with `serverTime` in minute 2; expected: 14 — evidence: green at branch head 1da4000, `pnpm --filter @superdoc-collab/history test:unit` 16 files / 80 tests passed; red under the mutation below
- [x] Confirmed it fails for the right reason at 2950b9e: `Error: resolveMark is not implemented` — evidence: throwaway worktree at 2950b9e, `version-marks.test.ts` 2 failed / 5 passed, both with `Error: resolveMark is not implemented` (version-marks.ts:49); worktree removed

## Unit

- [x] `version-marks.test.ts::a sequence the log does not know clamps down like before` — input: `serverTime: null`; expected: 9 for 12, 3 for 1, null with no marks — evidence: passes at 1da4000 (7 of 9 pass under the mutation, this case among them)
- [x] `update-log.test.ts` or a new case: `serverTimeOf` returns the row's time for a logged sequence and null for an unknown one — evidence: `update-log.test.ts::serverTimeOf answers the logged time for a sequence of the document and null otherwise` added at 6c9f287 (after the tester's head): logged → its time, unknown → null, another document's sequence → null; libs/history `update-log.test.ts` + `version-marks.test.ts` 14/14 (lead's run and the reviewer's)
- [x] `versions-routes.test.ts` property test: every sampled sequence resolves to `resolveMark` with the log's `serverTime`, text equals the replay until the resolved sequence — evidence: `cd apps/server && npx vitest run src/history/` 9 files / 80 tests passed at 1da4000
- [ ] `pnpm test:unit`; expected: green — pending the lead's local CI run on the PR head (GitHub Actions is unavailable; the owner chose local CI)

## E2E (Playwright specs)

- [ ] `pnpm test:e2e e2e/time-travel.spec.ts`; expected: 9 passed — pending the lead's local CI run on the PR head (earlier local run at 1da4000: 9 passed (2.0m))
- [x] Mutation: make `resolveMark` ignore `serverTime` (scratch), run `version-marks.test.ts`; expected: the pruned-sequence case fails; restore — evidence: inserted an unconditional `return clampToMark(...)` before the `serverTime` branch; 2 failed / 7 passed: `a sequence whose mark was pruned…` (`expected 9 to be 14`) and `a sequence pruned in the bootstrap minute…` (`expected 3 to be 5`); restored with `git checkout -- libs/history/src/version-marks.ts`, `git status` clean

## Prove it for real — Playwright MCP

Stack `pnpm scenario:stack` on 3200 as Ana, document `9eb2d158-d484-4283-a169-2567aae6064f` (uploaded two-paragraph seed, because typing into a blank New document crashed the editor, see edge cases).

- [x] Reproduce the race by hand: open a document, type in the live minute, open the live bin quickly from the chart; expected: the version shown contains the minute's edits or a later state, never the seed alone; the banner's sequence equals a surviving mark — evidence: after a ` race` edit the chart's live bin opened with banner sequence 139, which was then the newest mark `{118,120,133,139}` and its text held the edits; seconds later the minute's mark became 145 and `GET /versions/139/text` and `/versions/140/text` both returned sequence 145 with `Budget: the plan costs 10. More money raceHiring: we add two people. live again`, never the seed; `.pr-media/pruned-version-resolves-to-its-minute/live-bin-open-race-1280.png`
- [x] A shared `?at=` link copied from that state opened by a second member; expected: the same sequence and text — evidence: `?at=1792262520000` opened in a second tab of the same user (no second server was free, so not a second member): banner sequence 145 and the same text; `shared-at-link-second-view-1280.png`, `shared-at-link-second-view-375.png`
- [ ] Console and network clean — NOT TICKED: the version calls were 200 (a 202 then 200 on `/versions/139`), but the first tab logged one console error `v2 collaboration sync timed out after 30000ms` and its version frame stayed on `Loading document 4%` (`live-bin-open-after-wait-1280.png`); the fresh tab was clean (0 errors). Machine load average was above 12, so possibly load, not reproduced on a quiet machine

## Edge cases found during execution

- [ ] Typing into a blank New document (click the body, then `insertText`, `keyboard.type` or `fill` on the textarea); expected: the text appears — observed: `The editor stopped working. Reload the page to continue.`, text empty after reload, console clean; same alert the scenario-runs plan records. Probably unrelated to this change (history code only), not checked against main; regression test belongs to that lane — evidence: `blank-document-insert-text-editor-stopped-1280.png` — Lead's triage: this is SuperDoc's `edit-rejected` rejection of a keystroke on a focused textarea without a selection (docs/learnings/2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md); automation focuses the textarea without the click a user makes. PR #38 (editor-survives-rejected-edits) turns it into a status line; not a defect of this change — Lead's triage: SuperDoc's `edit-rejected` for a keystroke on a focused textarea without a selection (docs/learnings/2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md); automation focuses the textarea without a user's click. PR #38, merged, turns it into a status line; not a defect of this change
- [x] Request `/versions/<newest mark + 100>/text`; expected: newest mark — evidence: sequence 145 for a request above 145, status 200

## Adversarial review

- [x] Claim 1: a sequence newer than every mark still resolves to the newest mark — attack: request `lastSequence + 100`; result: **held** — evidence: tester's live run: `/versions/<145+100>` → 145; reviewer: an unlogged sequence keeps the clamp and gets the newest mark
- [x] Claim 2: the extra log read does not change the route's 202/409 behaviour while rebuilding — attack: read the route; result: **held** — evidence: the route still answers 202 while rebuilding and 409 without marks; `resolveMark` returns null only for empty marks (reviewer); tester saw a 202 then 200 on `/versions/139`
- [x] Claim 3: the CI race is closed, not narrowed — attack: replay the trace of run 39050524747 against `resolveMark`: 666 with its serverTime in the 16:44:10 minute → 678; result: **held** — evidence: reviewer's replay; the bootstrap-minute unit case encodes the same shape (4 in the bootstrap's minute → 5); tester's live run: pinned 139 resolved to 145 after the prune

## Coverage honesty

- The loaded-runner timing is not reproducible locally; the unit test encodes the trace, the CI dispatch is the live proof.
