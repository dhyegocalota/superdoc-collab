# Test plan: The edits chart shows idle stretches as marked breaks

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/timeline/idle-breaks.test.ts::a run of exactly the threshold is not a break` — input: a timeline with 30 empty interior bins of 10 s, threshold 300 000 ms; expected: `idleBreaksOf` returns `[]`
- [ ] `apps/web/src/lib/format-date-time.test.ts::formatIdleDuration reads 410 000 ms as "7 minutes"` — input: `durationMs: 410000`; expected: `"7 minutes"`
- [ ] `apps/web/src/features/timeline/streamgraph-layout.test.ts::a break is one column between its neighbours` — input: a silence of six one-minute bins between two runs of edit bins, width 600; expected: the column spans `BREAK_WIDTH_PX`, `binX(0)` is 0, `binX(last)` is 600
- [ ] `apps/web/src/features/timeline/streamgraph.test.tsx::ArrowRight from the bin before a break selects the first bin after it` — input: a timeline with a break after bin 1, selected index 1, key ArrowRight; expected: `onSelectIndex` called once with 2 (the first bin after the 41 empty bins)
- [ ] Confirmed each red test fails for the right reason: the failure text is recorded here after the red run. Expected reason: the function or the column is missing, not a broken fixture.

## Unit: idle breaks (`idle-breaks.test.ts`)

- [ ] `a run of exactly the threshold is not a break` — input: 30 empty bins of 10 s; expected: `[]`
- [ ] `a run one bin longer than the threshold is a break` — input: 31 empty bins of 10 s, interior; expected: one break with `durationMs` 310 000
- [ ] `a run touching the first bin is not a break` — input: bins 0 to 40 empty, then edits; expected: `[]`
- [ ] `a run touching the last bin is not a break` — input: edits, then bins empty to the last index; expected: `[]`
- [ ] Edge: two runs — input: two interior runs of 41 empty bins separated by one edit bin; expected: two breaks in index order with their first and last indexes
- [ ] Edge: a run split by one bin with volume — input: 20 empty, 1 with volume, 20 empty, interior; expected: `[]` (each part is 200 s, under the threshold)
- [ ] Edge: an empty bin is a bin whose bands all have zero volume — input: a bin with a band cell of zero inserted and agent zero; expected: that bin counts as empty

## Unit: duration label (`format-date-time.test.ts`)

- [ ] `formatIdleDuration` 410 000 ms — input: `durationMs: 410000`; expected: `"7 minutes"`
- [ ] Edge: one minute — input: `60000`; expected: `"1 minute"`
- [ ] Edge: 59 minutes — input: `3540000`; expected: `"59 minutes"`
- [ ] Edge: rounds to an hour — input: `3570000` (59.5 minutes); expected: `"1 hour"`
- [ ] Edge: two hours — input: `7200000`; expected: `"2 hours"`
- [ ] Edge: two days — input: `172800000`; expected: `"2 days"`

## Unit: copy (`timeline-copy.test.ts`)

- [ ] `noEditsForLabel({ duration: '7 minutes' })` — expected: `"No edits for 7 minutes"`
- [ ] `streamgraphDescription` with one break — input: `bandCount: 3`, `from: 'a'`, `to: 'b'`; expected: the string ends with "Long stretches without edits are shortened."
- [ ] `streamgraphDescription` without a break keeps its existing sentence, and the new sentence follows it — expected: the first sentence is unchanged

## Unit: layout (`streamgraph-layout.test.ts`)

- [ ] `binX(0)` is 0 and `binX(last)` is the width — input: six one-minute-bin silence, width 600; expected: 0 and 600
- [ ] Bins on either side of the break keep the pitch — input: as above; expected: the distance between bins 0 and 1 equals the distance between the bin before the break and the bin after it, measured across no break
- [ ] The break spans `BREAK_WIDTH_PX` — expected: `binX` of the first bin after the break minus `binX` of the bin before it equals `BREAK_WIDTH_PX`, in place of the pitch
- [ ] `binX` of a bin inside the break is the centre of the column — expected: a value between the column edges
- [ ] `binAt` at the centre of the column returns the first bin after the break — input: the column centre position; expected: the index of the first bin after the break
- [ ] `timeX` for a time inside the break is the column centre — input: the start of the 10th empty bin; expected: the same x as the column centre
- [ ] `timeX` for a time outside any break is unchanged — input: a time in bin 1; expected: the value from the linear mapping before this change
- [ ] A band with volume on both sides of the break has two closed paths — expected: its `path` string contains two `M` commands and ends with `Z`
- [ ] A band with volume on both sides has an agent path per segment — input: agent volume on both sides; expected: two closed agent paths
- [ ] A label never straddles the break — input: a wide band name next to the break; expected: the label box lies within one segment, or the label is `null`
- [ ] Edge: a timeline with no break — input: the existing `binAt` and `binX` fixtures; expected: the same numbers as the existing tests, which stay green
- [ ] Edge: a break with a single bin of width — input: 31 empty bins of 10 s; expected: one column, no divide by zero, `binX` finite everywhere

## Unit: chart (`streamgraph.test.tsx`)

- [ ] One divider per break — input: a timeline with one break; expected: exactly one `line` element with `aria-hidden="true"` and a `stroke-dasharray` style
- [ ] No divider without a break — input: the existing `timeline` fixture; expected: no `line` with `aria-hidden` is rendered by the break divider
- [ ] The divider uses the token set — expected: its class name contains a token class and no hex colour appears in its attributes
- [ ] Hover over the break's column — input: `pointerMove` at the column centre; expected: `role="tooltip"` with the text "No edits for 6 minutes" for a 360 000 ms break and no bin range
- [ ] Hover over a bin — input: `pointerMove` over a bin; expected: the bin's range tooltip, as before
- [ ] Edge: keyboard ArrowLeft from the first bin after a break — input: selection on the first bin after the break, key ArrowLeft; expected: `onSelectIndex` with the bin before the break
- [ ] Edge: keyboard from inside a break, ArrowLeft — input: selection inside the break, key ArrowLeft; expected: `onSelectIndex` with the last bin before the break
- [ ] Edge: keyboard from inside a break, ArrowRight — input: selection inside the break, key ArrowRight; expected: `onSelectIndex` with the first bin after the break
- [ ] Edge: Home and End are unchanged — input: keys Home and End with a break; expected: `onSelectIndex` with 0 and with the last index
- [ ] Existing test "arrow keys, End and Escape drive the selection" — expected: still green, unchanged
- [ ] Pointer press in the column — input: `pointerDown` at the column centre; expected: `onSelectIndex` with the first bin after the break
- [ ] Agent action inside a break — input: an action whose `createdAt` falls inside the break; expected: its mark's `left` is the column centre and its tooltip text is unchanged
- [ ] Break marks are hidden from assistive technology — expected: the divider and the break tooltip carry no accessible name of their own; the description still says the stretches are shortened

## E2E (Playwright spec)

- [ ] `e2e/timeline-idle-gaps.spec.ts::a silence of more than five minutes shows one break` — steps: sign in as Ana, upload the seed, type two edit bursts, read the real timeline, serve it with a silence of 41 empty 10-second bins inserted between the bursts through `page.route`, open the Edits panel; expected: exactly one divider in the chart and no bin rendered inside the silence
- [ ] `e2e/timeline-idle-gaps.spec.ts::ArrowRight crosses the break in one press` — steps: as above, select the bin before the break and press ArrowRight once; expected: `currentAt` equals the start of the first bin after the break and the selection line moves once
- [ ] `e2e/time-travel.spec.ts` (existing) — steps: run alone; expected: green, its documents have no break
- [ ] `e2e/timeline.spec.ts` (existing) — steps: run alone; expected: green, its documents have no break

## Prove it for real — Playwright MCP

- [ ] Happy path, entry to exit: a document with two bursts and a silence of more than five minutes served through the walk fixture; steps: open the Edits panel, look at the chart, hover the break, press ArrowRight from the bin before it; expected: one dashed divider, the tooltip reads "No edits for N minutes", the selection moves to the bin after the break in one press
- [ ] Empty: a document with one edit; expected: no break, the chart renders as before
- [ ] Single: a document with one burst and no silence; expected: no break
- [ ] Many: a document with several bursts and silences of different lengths; expected: one break per silence over the threshold, none under it
- [ ] Day bins: a document whose span needs day bins; expected: each quiet day is a break, labelled in days, and the walk records whether that reads as noise (see ADR 0039 revisit trigger)
- [ ] Browser Back mid-flow: select a bin across a break, press Back; expected: the previous state returns, with the break in the same place
- [ ] Reload mid-flow: select a bin after a break and reload; expected: the same bin is selected, `?at=` is the same, the break is drawn again
- [ ] Two authors in two browser contexts at once: Ana opens the panel on the silence, Bruno edits in the next burst; expected: Ana's chart gains the bin of Bruno's edit and the break stays one column
- [ ] Console and network clean: zero console errors, zero failed requests, other than the expected exceptions
- [ ] Desktop width 1280: the chart is legible, the divider is visible in both themes; expected: screenshots at `.pr-media/timeline-idle-gaps/walk/desktop-light.png` and `desktop-dark.png`
- [ ] Narrow width 375: the chart fits, the break column keeps 16 px and the label fits the tooltip; expected: screenshot at `.pr-media/timeline-idle-gaps/walk/narrow-light.png`
- [ ] Dark theme: the divider and the tooltip read against the dark background; expected: screenshot at `.pr-media/timeline-idle-gaps/walk/desktop-dark.png`
- [ ] Video at `.pr-media/timeline-idle-gaps/walk/walk.mp4` (recorded by the recorder role for `/check-ui`)

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: a bin inside a break carries the version of the bin before it, so skipping a break loses no version — attack: a version mark placed inside the silence; result: <refuted | held>
- [ ] Claim 2: a break never includes the first or last bin — attack: a timeline whose first edit is later than the silence, with agent actions that widen the span; result: <refuted | held>
- [ ] Claim 3: the piecewise scale keeps `binAt` and `binX` inverse on bins outside a break — attack: sweep every pixel of a 600 px chart with breaks at both edges of a bin; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- Label placement quality on a crowded chart with several breaks — only the no-straddle rule is unit tested; the walk looks at the result.
- Breaks at day and week bins — one unit test and the walk; the decision on whether they read as noise waits for the owner's answer.
- Hover and tap on a touch device — the chart's pointer code is the same as before; the walk covers the desktop and the 375 layout with a pointer, not a real touch device.
- Render cost with breaks — not measured; the break count is at most the bin count, so no budget regresses, but no number is recorded.
- The E2E uses a served timeline, not a real five-minute silence, because no test clock exists; the route helper builds it from the real response.
