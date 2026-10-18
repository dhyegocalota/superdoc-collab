# Tester briefing: The edits chart shows idle stretches as marked breaks

Written for the developer sub-agent that builds this feature. It is the handover for the tester, to be filled when the build ends. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/web/src/features/timeline/idle-breaks.ts` (new): finds the interior runs of empty bins longer than the threshold.
- `apps/web/src/features/timeline/streamgraph-layout.ts`: `IDLE_BREAK_MS` and `BREAK_WIDTH_PX` beside `CHART_HEIGHT`; the x scale is piecewise over segments; `binX`, `binAt` and `timeX` handle breaks; the band paths are drawn per segment.
- `apps/web/src/features/timeline/streamgraph.tsx`: one dashed divider per break, `aria-hidden`; a tooltip for a break; the keyboard steps over a break in one press.
- `apps/web/src/features/timeline/timeline-copy.ts`: `noEditsForLabel`, and one sentence in `streamgraphDescription`.
- `apps/web/src/lib/format-date-time.ts`: `formatIdleDuration`.
- The server, the bin ladder, the cap and the bin indexes are unchanged.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline src/lib/format-date-time.test.ts
pnpm typecheck
pnpm exec playwright test e2e/timeline-idle-gaps.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `apps/web/src/features/timeline/idle-breaks.test.ts` | the module does not exist | `idleBreaksOf` returns the interior runs longer than the threshold |
| `apps/web/src/lib/format-date-time.test.ts` (`formatIdleDuration`) | the function does not exist | the duration reads in minutes, hours and days |
| `apps/web/src/features/timeline/streamgraph-layout.test.ts` (breaks) | the scale is linear and has no column | the scale is piecewise and the column has `BREAK_WIDTH_PX` |
| `apps/web/src/features/timeline/streamgraph.test.tsx` (divider, tooltip, keys) | no divider, no break tooltip, the keys step one bin | the divider, the tooltip and the one-press key step exist |
| `e2e/timeline-idle-gaps.spec.ts` | the spec does not exist | one divider and one press crosses the break |

Existing tests that must stay green without any edit: `streamgraph-layout.test.ts` (binAt and label snapshots), `streamgraph.test.tsx` ("arrow keys, End and Escape drive the selection"), `e2e/time-travel.spec.ts` and `e2e/timeline.spec.ts`.

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: a break is drawn only for a silence longer than five minutes, and never for a silence that touches the first or last bin. Break it by: a document whose silence is exactly five minutes, then one of 5 minutes and 10 seconds, and a document whose first edit is late.
2. Hypothesis: one ArrowRight crosses a break and selects the first bin after it. Break it by: pressing ArrowRight from the bin before a break, from the bin after it, and from a bin inside a break when a version sits there.
3. Hypothesis: the break's tooltip reads the duration in words and nothing else. Break it by: a break of 59 minutes and 30 seconds, and one of exactly one hour.
4. Hypothesis: time travel still lands on the same version across a break. Break it by: selecting the bin before a break, travelling, then selecting the bin after it; the version shown should match the server's bin version.
5. Hypothesis: the divider is hidden from assistive technology and the chart still says what it draws. Break it by: a screen reader pass over the chart and the description sentence.
6. Hypothesis: at day bins every quiet day is a break and labelled in days. Break it by: a document spanning several months with edits on a few days; record whether the breaks read as noise (ADR 0039, revisit trigger).

## Known gaps

- Label placement on a crowded chart with several breaks is checked only by the no-straddle rule and the walk.
- No touch-device pass; the pointer path is unchanged.
- The E2E serves a timeline built from the real response with the silence inserted, because no test clock exists.
- The threshold of five minutes and the width of 16 pixels are proposals awaiting the owner. The tester reports whether they read well, without changing them.
