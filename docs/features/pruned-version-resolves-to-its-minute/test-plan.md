# Test plan: A pruned version sequence resolves to its minute

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `libs/history/src/version-marks.test.ts::a sequence whose mark was pruned resolves to the surviving mark of its minute` — input: marks at minutes 0 (bootstrap, 3), 1 (9), 2 (14); sequence 12 with `serverTime` in minute 2; expected: 14
- [ ] Confirmed it fails for the right reason at 2950b9e: `Error: resolveMark is not implemented`

## Unit

- [ ] `version-marks.test.ts::a sequence the log does not know clamps down like before` — input: `serverTime: null`; expected: 9 for 12, 3 for 1, null with no marks
- [ ] `update-log.test.ts` or a new case: `serverTimeOf` returns the row's time for a logged sequence and null for an unknown one
- [ ] `versions-routes.test.ts` property test: every sampled sequence resolves to `resolveMark` with the log's `serverTime`, text equals the replay until the resolved sequence
- [ ] `pnpm test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `pnpm test:e2e e2e/time-travel.spec.ts`; expected: 9 passed
- [ ] Mutation: make `resolveMark` ignore `serverTime` (scratch), run `version-marks.test.ts`; expected: the pruned-sequence case fails; restore

## Prove it for real — Playwright MCP

- [ ] Reproduce the race by hand: open a document, type in the live minute, open the live bin quickly from the chart; expected: the version shown contains the minute's edits or a later state, never the seed alone; the banner's sequence equals a surviving mark
- [ ] A shared `?at=` link copied from that state opened by a second member; expected: the same sequence and text
- [ ] Console and network clean

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: a sequence newer than every mark still resolves to the newest mark — attack: request `lastSequence + 100`; result: <refuted | held>
- [ ] Claim 2: the extra log read does not change the route's 202/409 behaviour while rebuilding — attack: read the route; result: <refuted | held>
- [ ] Claim 3: the CI race is closed, not narrowed — attack: replay the trace of run 39050524747 against `resolveMark`: 666 with its serverTime in the 16:44:10 minute → 678; result: <refuted | held>

## Coverage honesty

- The loaded-runner timing is not reproducible locally; the unit test encodes the trace, the CI dispatch is the live proof.
