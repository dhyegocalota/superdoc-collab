# Plan: Streamgraph motion

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/web/src/features/timeline/streamgraph-bands.tsx` (the tween), `timeline-panel.tsx` (the one change detection that feeds the chart, the chips and the live cue)
**Assumptions (decided, owner can override):**
- A change is one answer of the timeline poll in which some bin's volume grew; it carries the newest such bin and the band that grew most there.
- The collapsed bar's chips show no count today, so the chip of the band that grew pulses instead of a count.
- "N new edits" counts the changes since the last announcement, not characters.
- The x axis labels sit at fixed edges and do not move; the break dividers and the agent action marks glide instead.
- A band whose path holds while its name or size changes shows the new name and size at once; only paths tween.

## Steps

- [x] **Step 1:** `d3-interpolate-path` and the motion constants; `useTweenedPaths` test-first on a fake clock (tween, ease-out, appear, disappear, retarget, memo key, reduced motion, cap, resize, cancel, rejected path, changed segment count).
- [x] **Step 2:** the chart tweens through `StreamgraphBands`, snapping under reduced motion.
- [x] **Step 3:** `useTimelineChange` (one change per growing answer, baseline reset on scope, bin size or zone) and `useChangePulse` (one pulse per change, none on mount, none while the pointer presses the chart).
- [x] **Step 4:** the glow in the band colour, the band stroke brightening, `bandCenterY` in the layout, the keyframes.
- [x] **Step 5:** the live cue next to the Edits heading and the chip ring in the collapsed bar, both fed by the panel.
- [x] **Step 6:** agent action marks glide on a `transform` transition and break dividers on a one-shot keyframe from their old x, both for the same duration; the divider keeps its `x1` because `e2e/timeline-idle-gaps.spec.ts` reads it.
- [x] **Step 7:** E2E walk: a remote edit tweens through intermediate paths, pulses and announces; under reduced motion it snaps and does not pulse.
- [x] **Step 8:** `pnpm typecheck` clean, the unit files one by one, `e2e/timeline.spec.ts` and `e2e/timeline-idle-gaps.spec.ts` (10 passed), the video and two screenshots in the git-ignored `.pr-media/streamgraph-motion/`.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A tween on every frame re-renders the whole chart | the hook lives in `StreamgraphBands`, so only the bands re-render | none needed |
| 3 | A filter or bin-size change reads as growth and pulses | scope and bin size are part of the baseline key; tests pin both | none needed |
| 6 | A divider offset in a rotated frame drifts diagonally | the diamond mark composes translate and rotate in one `transform` | none needed |
| 6 | A re-render mid-glide resets the offset and the divider jumps | the offset sits in state and changes only when the column moves | none needed |

**Steps with no backout:** none.
