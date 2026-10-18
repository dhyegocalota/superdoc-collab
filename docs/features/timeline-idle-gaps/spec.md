# The edits chart shows idle stretches as marked breaks

**Status:** Approved
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the owner asked for the fix after the production document showed a long silence drawn as an empty middle; the option chosen is A from the research, the collapse of idle stretches)
**ADRs:** [0039](../../adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md), [0016](../../adr/0016-timeline-bin-budget.md)
**Not changing:** the server's bins, their start and end, their indexes and the cap of 120 bins; the bin ladder and the covering rule; the time tiling of [ADR 0016](../../adr/0016-timeline-bin-budget.md); the versions, `?at=`, the bands, the agent marks' data and the selection summaries; the tooltip for a bin that has edits; the desktop layout of the panel.

## Problem

The server returns every bin from the first edit to the last, empty bins included. The streamgraph spaces bins evenly. A document edited in a 20-second burst, silent for 6 minutes 50 seconds, then edited again, yields 46 bins of 10 seconds, 41 of them empty. The chart draws two small shapes at its far edges and a blank middle, and the reader cannot tell that the blank is time without edits. See [ADR 0039](../../adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md) for the decision and the two options rejected.

## Goals

- A run of empty bins longer than five minutes draws as one narrow break column, not as its bins.
- The break is marked as a gap: a dashed divider, hidden from assistive technology, and a tooltip that names the length of the silence.
- The keyboard crosses a break in one press, so a reader moves between the edits on each side of a silence without pressing through empty bins.
- Selection, versions, `?at=`, bands, agent marks and the selection summaries keep their meaning, because no bin index changes.

## Non-goals

- Any change to the server, the bin ladder, the covering padding or the cap.
- An activity axis, a logarithmic or square-root axis, or a changed bin size.
- Breaks for silences shorter than the threshold, or a threshold chosen per document.
- Keyboard or pointer access to the bins inside a break. Their versions are the version of the bin before the break, which stays reachable.

## Design

### Data flow

1. `idle-breaks.ts` (new, `features/timeline`) finds the breaks of a timeline. A bin is silent when no band has volume in it (`cellVolume` is zero for every band) and its version sequence equals the bin before it, so a bin that cuts a version stays reachable. A break is a run of consecutive silent bins that does not include the first or the last bin and whose length in milliseconds is longer than `IDLE_BREAK_MS`. The run's length is the end of its last bin minus the start of its first, converted at the edge.
2. `streamgraph-layout.ts` takes the breaks and lays the bins out in segments. Each bin outside a break keeps an equal pitch. A break takes `BREAK_WIDTH_PX`, or one interval between visible bins when that is smaller, in place of the pitch between its neighbours, so a dense chart keeps its bins. The total width stays the width of the chart, and the first and last bins stay at its edges.
3. The band areas and the agent layer are drawn once per segment, so a band with volume on both sides of a break has two areas with a gap between them. Labels are placed inside a segment and never across a break.
4. `binX(index)` returns the bin's position. For a bin inside a break it returns the centre of the column. `binAt(position)` returns the bin under the pointer; a position inside a break returns the first bin after it. `timeX(time)` maps a time inside a break to the centre of its column, and any other time as before.
5. `streamgraph.tsx` draws one dashed divider per break (`aria-hidden`, a stroke from the token set). A pointer over a break shows a tooltip with the break's copy and no bin range. The keyboard `nextIndex` steps over a break as one unit: ArrowRight from a bin moves to the next bin, and when that next bin is the first bin of a break it moves to the first bin after the break; ArrowLeft mirrors it. From a bin inside a break, ArrowLeft goes to the last bin before it and ArrowRight to the first bin after it. Home and End are unchanged.
6. `IDLE_BREAK_MS` and `BREAK_WIDTH_PX` sit beside `CHART_HEIGHT` in `streamgraph-layout.ts`. Durations cross the layout in milliseconds and convert at the edge.
7. `formatIdleDuration` goes in `apps/web/src/lib/format-date-time.ts`, because [the web rules](../../../.claude/rules/web-ui.md) say every time on screen goes through that file. It uses `MINUTE_MS`, `HOUR_MS` and `DAY_MS` from `libs/types`.

### Interfaces

- `idleBreaksOf({ timeline, thresholdMs })` returns `{ firstIndex, lastIndex, durationMs }[]`, in index order. The threshold is a parameter, so `idle-breaks.ts` does not import the layout that imports it.
- `StreamgraphLayout` gains `breaks` for the rendering; `binX`, `binAt` and `timeX` keep their names and signatures.
- `streamgraphDescription` gains one sentence: "Long stretches without edits are shortened."
- `timeline-copy.ts` gains `noEditsForLabel({ duration })`, returning "No edits for {duration}".
- `formatIdleDuration({ durationMs })` returns the duration in words in the reader's language, for example "7 minutes", "1 hour" or "2 days".

### Failure handling

- A timeline with no break renders exactly as today; the existing layout, keyboard and tooltip tests stay green without edits.
- A timeline with breaks at its edges cannot occur from the server, because the server pads one bin on each edge. If one arrives anyway, the run is not a break and is drawn as bins.
- A selection that points inside a break, from `?at=` or from a version, is drawn at the column and keeps its bin; the next key press leaves the break by the rule above.
- An agent action in a break is drawn at the column centre, with its tooltip unchanged.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Which idle stretches collapse | A, runs longer than five minutes; B, a larger threshold | A. The owner delegated these decisions to the lead. A break is a run of empty bins longer than five minutes; a run of exactly five minutes is not one. A bin that cuts a new version (its version sequence differs from the bin before it) is never empty, so it ends a run and stays reachable | 2026-10-18 |
| Width of a break | A, 16 px; B, 24 px | A. `BREAK_WIDTH_PX` (16 px), or one interval between visible bins when that is smaller, is the distance between the bin before the break and the bin after it, in place of the pitch | 2026-10-18 |
| Visual treatment | A, dashed divider and tooltip; B, a hatched column | A. The dashed divider uses the muted foreground token. `design.md` is waived: the owner saw the production chart and asked for the gap to go, and the treatment follows ADR 0039 | 2026-10-18 |
| Break wording | "No edits for 7 minutes", without a full stop | "No edits for N minutes", "hours" or "days" (singular for one), without a full stop, matching "No edits in this period" | 2026-10-18 |
| Day and week bins, where every empty bin is longer than five minutes | A, every empty interior bin is a break; B, a minimum run length in bins | A. Day and week bins collapse the same way, so each quiet day is a break; the revisit trigger is in ADR 0039 | 2026-10-18 |

## Test strategy summary

- Unit, red first: `idle-breaks.test.ts` (a run of exactly the threshold is not a break; one just over is; a run touching either edge is not; two runs; a run with one bin of volume splits in two); `streamgraph-layout.test.ts` (piecewise `binX`, `binAt` and `timeX`, two areas for a band across a break, labels never across a break, the total width); `streamgraph.test.tsx` (one divider per break and none without one, the divider is `aria-hidden`, the break tooltip, the keyboard crosses a break in one press both ways and from inside a break, an agent mark in a break at the column centre, the description sentence); `format-date-time.test.ts` (`formatIdleDuration`); `timeline-copy.test.ts` (`noEditsForLabel`).
- E2E, `e2e/timeline-idle-gaps.spec.ts`: a document with a silence of more than five minutes shows one break and ArrowRight from the bin before it selects the bin after it in one press. The silence cannot be made in a test run, so the test serves a timeline built from the real response with the silence inserted, through `page.route`.
- Walk with Playwright MCP at 1280 and 375, both themes, on a document with a long silence and on one with day bins.
