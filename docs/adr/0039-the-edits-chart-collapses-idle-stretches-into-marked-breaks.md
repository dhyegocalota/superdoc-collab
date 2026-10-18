# 0039. The edits chart collapses idle stretches into marked breaks

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the owner's production document of 2026-10-18 (a 20-second burst of edits, 6 minutes 50 seconds of silence, then edits again: the server returned 46 bins of 10 seconds, 41 of them empty, and the streamgraph drew two small shapes at its edges with a blank middle); [ADR 0016](0016-timeline-bin-budget.md) (the bin budget and the time tiling); `docs/features/timeline-idle-gaps/spec.md`.

## Context

The server returns every bin from the first edit to the last, one padding bin on each edge, and the bins tile time: each bin starts where the previous one ends ([ADR 0016](0016-timeline-bin-budget.md)). The streamgraph places bins at equal steps along the width. A silence therefore costs as much width as an active minute, and under the cap of 120 bins a long silence at a fine bin size takes most of the chart. The reader sees two shapes and an empty middle, and cannot tell that the middle is time without edits.

## Decision

- The server is unchanged. Its bins, their indexes, their tiling and the cap of 120 stay as [ADR 0016](0016-timeline-bin-budget.md) records them.
- The client collapses each run of consecutive empty bins that is longer than `IDLE_BREAK_MS` into one break column of `BREAK_WIDTH_PX`. `IDLE_BREAK_MS` is five minutes and `BREAK_WIDTH_PX` is 16 pixels, both proposed and open to the owner. A run that touches the first or the last bin is never a break, because the server pads one bin on each edge.
- A bin that cuts a new version is never part of a break. A break holds only empty bins whose version equals the bin before it, so every version stays reachable by keyboard and pointer.
- A break is drawn as a gap. Each band's area is drawn separately on each side of it, and a dashed divider marks the column; the divider is `aria-hidden`.
- A break's tooltip names its length, for example "No edits for 7 minutes". The length is formatted from milliseconds at the edge.
- The keyboard treats a break as one step. ArrowRight from the bin before a break lands on the first bin after it, and ArrowLeft reverses. Bin indexes do not change, so selection, versions, `?at=`, bands and agent marks keep their meaning.
- A time inside a break maps to the centre of its column for agent marks and the selection line. A pointer press in the column selects the first bin after it, the bin that ArrowRight reaches.
- The streamgraph description gains one sentence saying that long stretches without edits are shortened.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Activity axis: re-bin over active windows only, so idle time has no bins | The chart shows only time with edits, with no marker needed | Bins stop tiling time, so a bin no longer covers its span. [ADR 0016](0016-timeline-bin-budget.md) would be superseded, and every reader of bin start and end (`?at=`, versions, selection summaries, agent marks) must learn about gaps | Changes the contract of the timeline to fix a drawing |
| Logarithmic or square-root time axis | Idle time stays visible and proportional to its length, with no new visual element | A silence shrinks but never disappears, and a 10-second bin and a 10-minute bin take unequal widths, so the silhouette and the reading of "how much" both get worse | Bands stop being proportional to time, which the chart relies on |
| Break collapse on the client (chosen) | Server contract unchanged, bins and indexes unchanged, the idle time is named | A break is a visible departure from linear time, and the rule needs a threshold | The gap is shown and labelled, and nothing else moves |

## Consequences

- A silence costs one break column, so the active minutes get the width the silence took.
- Every bin in a break carries the version of the bin before it. A formatting-only update inside a silence cuts a version at its minute without any text volume ([`version-marks.ts`](../../libs/history/src/version-marks.ts)), so the version rule above keeps every version reachable: that bin ends the run and skipping a break loses no version.
- Breaks never touch the first or last bin, so Home and End always reach a bin that is not inside a break.
- At day or week bins every empty interior bin is longer than five minutes, so each quiet day becomes a break. This is accepted and checked in the walk.
- Time across a break is no longer linear, and the break says so in its tooltip and its divider.
- [ADR 0016](0016-timeline-bin-budget.md) stands in full.

## Evidence

- The production document of 2026-10-18 described above: 46 bins, 41 of them empty, two shapes at the edges.
- The unit and component tests named in `docs/features/timeline-idle-gaps/test-plan.md` pin the rule, the keyboard step and the mapping of time to the column.
- No measurement of render cost yet. The break count is at most the bin count, and each break removes width, so the render budget of [ADR 0016](0016-timeline-bin-budget.md) does not grow.

## Revisit when

- A reader on production-like data cannot read the breaks in the walk, or takes a break for missing data.
- Breaks at day or week resolution read as noise. The answer is then a minimum run length in bins beside the duration.
- Alternating quiet and active days at day bins draw a divider between every pair (14 on a 31-day span in the tester's walk); it was legible but busy. The same answer applies.
- The chart moves to canvas or WebGL, so the render budget no longer binds.
- The server starts returning bins chosen by activity. That would supersede [ADR 0016](0016-timeline-bin-budget.md) and this decision with it.
