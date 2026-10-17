# 0015. The timeline draws at most 120 bins

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/timeline-and-time-travel/spec.md` (silhouette "neither flat nor spiky" at 60–120 bins; the 16 ms render budget at 120 bins × 8 topics), the comment audit of 2026-10-17 (the cap was recorded only in the spec, and the covering bins overshot it)

## Context

The streamgraph re-renders on hover, scrub and every projection tick. Its cost grows with bins × bands, and label placement runs per data change. The spec fixed a render budget of 16 ms at 120 bins and eight topics, and chose bin sizes so the silhouette is neither flat nor spiky. The number lived only in the spec, and the two functions that honour it disagreed: `chooseBinMs` reserved one extra bin while `binStartsCovering` adds one empty bin on each side plus the inclusive last one, so a 119-minute span with one-minute bins produced 122 bins.

## Decision

- `MAX_BINS = 120` is the hard cap on the bins the server returns for a timeline.
- The bin size is the finest step of `BIN_LADDER_MS` (10 s, 30 s, 1 min … 1 day, 1 week) for which the span, rounded up, plus `COVERING_EXTRA_BINS` (one empty bin on each edge plus the inclusive last bin) fits in `MAX_BINS`; spans beyond the ladder fall back to a whole number of weeks computed against the same budget.
- `binStartsCovering` and `chooseBinMs` share `EDGE_BINS` and `COVERING_EXTRA_BINS`, so the count the chart receives is the count the budget was computed for.
- `?binMs=` on `GET /timeline` still pins a ladder step for debugging; it is not subject to the cap.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| No cap, one bin per ladder step | simplest | a month of minute bins is tens of thousands of paths | render time and label placement explode |
| Cap on the client | server stays dumb | the server still ships every bin; the client re-bins on every render | duplicated logic, slower hover |
| Drop the empty edge bins | no padding to account for | the first and last edits sit on the chart border with no run-in | the streamgraph needs the silhouette to rise from zero |

## Consequences

- A span just under a ladder boundary now takes the next coarser step (119 minutes draws 2-minute bins, not 1-minute bins) so that the cap holds.
- `libs/history/src/timeline/bins.test.ts` asserts the real count of `binStartsCovering` across spans and offsets, not the arithmetic of `chooseBinMs` alone.

## Evidence

- The scratch reproduction of the overshoot from the audit: a 119-minute span, 1-minute bins, 122 bins at every offset.
- `bins.test.ts::a span of %i ms never draws more than MAX_BINS bins`.

## Revisit when

- The chart moves to canvas or WebGL and the render budget no longer binds.
- The spec's 16 ms measurement is repeated with the real label placement and gives a different number.
