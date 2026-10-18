# Plan: The edits chart shows idle stretches as marked breaks

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `streamgraph-layout.ts` (the x scale and the band paths), `streamgraph.tsx` (divider, break tooltip, keys), `timeline-copy.ts` and `format-date-time.ts` (copy and the duration label). The server is not touched.
**Assumptions (decided, owner can override):**
- Empty bin means no band has volume in it, using `cellVolume` from `libs/history/src/timeline/stack.ts`.
- A break is an interior run of empty bins, longer than `IDLE_BREAK_MS` (five minutes), that does not include the first or the last bin.
- `IDLE_BREAK_MS` and `BREAK_WIDTH_PX` sit beside `CHART_HEIGHT` in `streamgraph-layout.ts`. `idleBreaksOf` takes the threshold as a parameter, so the new module does not import the layout.
- A band's area is split at each break, one closed path per segment, so a gap reads as a gap.
- Pointer press in a break selects the first bin after it. Keyboard and pointer agree.
- The duration label is `formatIdleDuration` in `format-date-time.ts`, because the web rules put every time on screen in that file. It rounds to the nearest minute, uses hours from 60 minutes and days from 24 hours.
- The E2E serves a timeline with the silence inserted through `page.route`, because a real five-minute silence cannot be made inside a test run.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/timeline/idle-breaks.ts` (new), `idle-breaks.test.ts` (new), `apps/web/src/features/timeline/streamgraph-layout.ts`, `streamgraph-layout.test.ts`, `apps/web/src/features/timeline/streamgraph.tsx`, `streamgraph.test.tsx`, `apps/web/src/features/timeline/timeline-tooltip.tsx` (only if the break tooltip reuses it), `apps/web/src/features/timeline/timeline-copy.ts`, `timeline-copy.test.ts`, `apps/web/src/lib/format-date-time.ts`, `format-date-time.test.ts`, `e2e/timeline-idle-gaps.spec.ts` (new), `e2e/timeline.ts` (a route helper only, if the spec needs it), `docs/features/README.md` (this feature's row), `docs/features/timeline-idle-gaps/tester-briefing.md` | `developer-ig` |

## Sequencing

One developer, steps in order. Steps 1 to 3 are pure functions and copy and can be checked alone. Steps 4 to 8 change the chart and depend on step 1. Step 9 is the E2E and depends on all of them. Run one targeted test at a time: the machine serializes heavy commands, so each step runs only the file it touched.

## Steps

### G1

- [ ] **Step 1:** red test in `idle-breaks.test.ts`: a run of exactly the threshold is not a break; a run one bin longer is; a run that includes the first or the last bin is not; two runs give two breaks in index order; a run split by one bin with volume gives two shorter runs, neither a break. Then `idleBreaksOf({ timeline, thresholdMs })` in `idle-breaks.ts`; green.
- [ ] **Step 2:** red tests in `format-date-time.test.ts` for `formatIdleDuration`: 410 000 ms reads "7 minutes"; 60 000 ms reads "1 minute"; 3 540 000 ms (59 minutes) reads "59 minutes"; 3 570 000 ms rounds to 60 minutes and reads "1 hour"; 7 200 000 ms reads "2 hours"; 172 800 000 ms reads "2 days". Then the function in `format-date-time.ts`, using `MINUTE_MS`, `HOUR_MS`, `DAY_MS`; green.
- [ ] **Step 3:** red tests in `timeline-copy.test.ts`: `noEditsForLabel({ duration: '7 minutes' })` returns "No edits for 7 minutes"; `streamgraphDescription` ends with "Long stretches without edits are shortened."; then the copy in `timeline-copy.ts`; green.
- [ ] **Step 4:** red tests in `streamgraph-layout.test.ts` on a timeline built with `timelineWith` that has a 41-bin silence between two edit bins: `binX(0)` is 0 and the last bin's `binX` is the width; the bins on either side of the break keep the pitch; the break spans `BREAK_WIDTH_PX`; `binX` of a bin inside the break is the column centre; `binAt` at the column returns the first bin after; `timeX` for a time inside the break is the column centre and for other times is unchanged; a band with volume on both sides of the break has two closed paths; a label never straddles the break; a timeline without a break gives the same `binX` and `binAt` as before (the existing tests stay green). Then the piecewise scale in `streamgraph-layout.ts`, with `IDLE_BREAK_MS` and `BREAK_WIDTH_PX` beside `CHART_HEIGHT`; green.
- [ ] **Step 5:** red tests in `streamgraph.test.tsx`: a timeline with one break renders exactly one `line` with `aria-hidden` and a dash array; a timeline without one renders none; the divider is in the token class set, not a hex. Then the divider in `streamgraph.tsx`; green.
- [ ] **Step 6:** red tests in `streamgraph.test.tsx`: a pointer move over the break's column shows a tooltip with the text "No edits for 7 minutes" for a 410 000 ms break and no bin range; a pointer move over a bin still shows its range. Then the hover state in `streamgraph.tsx` (and `timeline-tooltip.tsx` if reused); green.
- [ ] **Step 7:** red tests in `streamgraph.test.tsx` on the keys: with the selection on the bin before a break, ArrowRight calls `onSelectIndex` with the first bin after the break; with the selection on the first bin after, ArrowLeft calls it with the bin before the break; with the selection inside a break, ArrowLeft calls it with the last bin before and ArrowRight with the first bin after; Home and End unchanged; the existing test "arrow keys, End and Escape drive the selection" stays green. Then `nextIndex` in `streamgraph.tsx`, given the breaks; green.
- [ ] **Step 8:** red test in `streamgraph.test.tsx`: an agent action whose time falls inside a break renders its mark at the column centre, and its tooltip text is unchanged. Then no code change is expected if step 4's `timeX` is right; if one is needed, it is made in `streamgraph.tsx` and recorded here; green.
- [ ] **Step 9:** red E2E in `e2e/timeline-idle-gaps.spec.ts`: a real document with two edit bursts, the timeline response served with a silence of more than five minutes inserted between them (built from the real response and served through `page.route`, the way `e2e/summary-mobile.spec.ts` routes version requests); expected: exactly one divider; its tooltip reads "No edits for" followed by a duration; one ArrowRight from the bin before the break selects the bin after it. Then the helper in `e2e/timeline.ts` if needed; green when run alone.
- [ ] **Step 10:** no product change. Run `e2e/time-travel.spec.ts` and `e2e/timeline.spec.ts` once each, alone. Their documents have no break, so their key counts in bins stay right. If either one fails, the step records why; it is not fixed by editing the keys.
- [ ] **Step 11:** `pnpm typecheck` green; `docs/features/README.md` row; `tester-briefing.md` written by the developer.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | a run touching the edge collapses, so Home or End lands inside a break | the `idle-breaks.test.ts` edge case goes red | the edge check returns no break for that run |
| 2 | rounding crosses a unit and "60 minutes" shows | the rounding test at 59m30s goes red | the unit is chosen after rounding to the nearest minute |
| 4 | `binX` and `binAt` disagree inside a break, so a press in the column lands on another bin | the `binAt` at the column test goes red, or the E2E selects the wrong bin | `binAt` returns the first bin after the break; timelines without a break keep the old layout |
| 4 | a label straddles the column and sits over the gap | the label-across-break test goes red | labels are placed per segment, so a label that does not fit a segment stays unlabelled |
| 5 | the divider is read by assistive technology | the `aria-hidden` assertion goes red | the attribute is on the element |
| 7 | ArrowRight from the bin before a break skips the first bin after it | the keyboard test goes red | `nextIndex` returns the first bin after the break, one unit away |
| 9 | the E2E cannot seed a silence and depends on a served timeline that drifts from the real one | the E2E passes but the served timeline has no bins the server would send | the helper builds the timeline from the real response, so the drift is limited to the inserted run |
| 10 | a key-counting E2E breaks when a document grows a break | `time-travel.spec.ts` or `timeline.spec.ts` goes red | the test keeps its documents short; the count is not changed to hide the break |

**Steps with no backout:** none. Every step is a client change; reverting its commit restores the previous chart.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded at 1280 and 375, both themes.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
