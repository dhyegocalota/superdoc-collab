# Tester briefing: Streamgraph motion

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/web/src/features/timeline/use-tweened-paths.ts` — band paths tween over `STREAMGRAPH_TRANSITION_MS` with `d3-interpolate-path` in one `requestAnimationFrame` loop; appear from a flat baseline, disappear to it, retarget mid-tween, snap under reduced motion, above `MAX_TWEENED_BANDS`, on a width change, on a changed segment count and on a path the library rejects (one warning per session).
- `apps/web/src/features/timeline/use-timeline-change.ts` — one change per timeline answer in which a bin's volume grew (newest such bin, band that grew most); the baseline restarts on a new filter, bin size or zone and while the query shows placeholder data.
- `apps/web/src/features/timeline/use-change-pulse.ts` — one pulse per change for `STREAMGRAPH_PULSE_MS`; none for a change present at mount, none while suppressed.
- `apps/web/src/features/timeline/streamgraph-pulse.tsx`, `band-style.ts`, `streamgraph-bands.tsx`, `streamgraph.tsx` — the blurred glow in the band colour at the bin and band centre (`bandCenterY` in `streamgraph-layout.ts`), the band stroke brightening, no pulse while the pointer presses the chart (`isSelecting` in `use-streamgraph-interaction.ts`).
- `apps/web/src/features/timeline/live-cue.tsx`, `use-live-announcement.ts`, `panel-header.tsx` — a dot beside "Edits" that breathes once per change and a `polite` live region reading "N new edits", at most one announcement per `LIVE_ANNOUNCE_MS`.
- `apps/web/src/features/timeline/timeline-collapsed-bar.tsx` — the chip of the band that grew shows a fading ring.
- `apps/web/src/features/timeline/streamgraph-markers.tsx`, `agent-action-marks.tsx`, `streamgraph-motion.ts` — dividers glide by a one-shot keyframe from their old x; agent action marks glide on a `transform` transition.
- `apps/web/src/features/timeline/timeline-panel.tsx` — the one `useTimelineChange` feeding the chart, the chips and the header.
- `apps/web/src/styles/globals.css` — keyframes and classes; `libs/types/src/constants.ts` — four constants; `apps/web/package.json` — `d3-interpolate-path` and its types.
- `e2e/timeline.ts`, `e2e/timeline.spec.ts` — a sampler and two walks.

## How to run

```bash
pnpm install
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/use-tweened-paths.test.ts
pnpm exec playwright test e2e/timeline.spec.ts e2e/timeline-idle-gaps.spec.ts
```

## Red today, green after

Red failure text is what the red run printed. Rows marked pin were green when they landed.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `use-tweened-paths.test.ts` (11 tests) | `Error: useTweenedPaths is not implemented` | the hook interpolates, retargets and snaps |
| `use-tweened-paths.test.ts` segment count | `expected 'M0,8.59392L90.62613…' to be 'M0,10L100,10L100,40L0,40ZM0,30L100,30…'` | paths with a different segment count snap |
| `use-tweened-paths.test.ts` name and size | `expected 'Topic 0' to be 'Staff Hiring'` | the latest band metadata is merged over the tweened path; found by the regroup walk in `timeline.spec.ts`, which failed with the old hook |
| `use-timeline-change.test.ts` (9 tests) | `Error: useTimelineChange is not implemented` | baseline, growth, scope and bin size rules |
| `use-change-pulse.test.ts` (5 tests) | `Error: useChangePulse is not implemented` | one pulse per change |
| `use-change-pulse.test.ts` suppressed ends running pulse | red text not captured (the run was queued behind the machine lock and only its summary was kept) | `setPulse(null)` on a suppressed change |
| `streamgraph.test.tsx` tween | `AssertionError: expected 'M0,92.482L50,91.372C100,90.263…' to be 'M0,27.601L50,24.608C100,21.616…'` | `StreamgraphBands` uses the hook |
| `streamgraph.test.tsx` pulse (2 of 5; the other 3 are pins that pass vacuously) | `TypeError: Cannot read properties of null (reading 'getAttribute')` and `expected null not to be null` | the glow, the band class and the suppression |
| `streamgraph.test.tsx` divider | `expected +0 to be close to 300` and `expected '' to be '0px'` | the divider keeps `x1` and glides from its old x |
| `streamgraph-layout.test.ts` `bandCenterY` | `Error: bandCenterY is not implemented` | middle of the band at the bin |
| `timeline-copy.test.ts`, `use-live-announcement.test.ts` (5), `live-cue.test.tsx` (3) | `… is not implemented` | implemented |
| `timeline-collapsed-bar.test.tsx` ring (1 of 3; the other 2 are pins) | the chip had no ring | the ring |
| `timeline-panel.test.tsx` (2 of 3; the unchanged-answer test is a pin) | `expected null not to be null` | the panel passes the change to chart, chips and header |
| `e2e/timeline.spec.ts` two new walks | pin, written after the implementation | — |

## Hypotheses to attack

1. Hypothesis: a remote edit moves the bands through at least three intermediate shapes within 700 ms. Break it by: a document with one bin (the shape then depends only on the band ratios), a Hiring-only edit, and a slow machine.
2. Hypothesis: nothing pulses on first load, on opening the panel, on a filter change or on a time-zone change. Break it by: opening the panel after edits arrived while it was collapsed; changing the filter while a poll is in flight; changing the zone in settings.
3. Hypothesis: holding the pointer on the chart suppresses the pulse for that change only. Break it by: pressing, releasing and waiting for the next poll; pressing with the keyboard focus on a band.
4. Hypothesis: reduced motion snaps everything and the live text still updates. Break it by: toggling the preference while a tween runs.
5. Hypothesis: resizing the panel does not lag by 600 ms. Break it by: dragging the separator and the window edge.
6. Hypothesis: the divider glide does not jump when the pointer hovers during the glide. Break it by: hovering the chart in the 600 ms after a rescale.
7. Hypothesis: the focused band keeps its focus ring and tab stop while its path moves. Break it by: tabbing to a band, then letting a change arrive.

## Known gaps

- The collapsed bar's chips show no count, so the chip pulses as a whole; the spec said "count".
- "N new edits" counts changes since the last announcement, not characters, and an identical text twice in a row is not re-read by a screen reader.
- The x axis labels sit at fixed edges, so there is nothing to move; dividers and agent marks glide.
- Agent marks use a `transform` transition; dividers use a keyframe so that `e2e/timeline-idle-gaps.spec.ts` keeps reading `x1`.
- Band labels (the in-chart text) snap while the shapes tween.
- When a break appears or disappears, bands with a different segment count snap instead of tweening.
- The reduced motion walk asserts exactly two distinct path values, which would fail if the server answered the one edit in two steps.
- Out-of-lane work: none. `e2e/timeline-idle-gaps.spec.ts` was left untouched.
