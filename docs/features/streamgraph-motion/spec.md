# The streamgraph animates every real-time change

**Status:** Shipped 2026-10-19
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "a last requirement: an animation/wow effect every time the streamgraph changes in real time, please!")
**ADRs:** [0039](../../adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md) (breaks stay), [0016](../../adr/0016-timeline-bin-budget.md)
**Not changing:** the bins, the data, the keyboard model, the selection and `?at=` semantics, the chart under `prefers-reduced-motion` (it keeps snapping)

## Problem

When an edit arrives, the chart redraws in one frame: bands jump, a new bin pops in, the breaks shift. Nothing shows that the document just moved.

## Design (recommended; the owner can override the motion choices)

- **Shape tweening.** Each band's path tweens from its previous `d` to the new one over `STREAMGRAPH_TRANSITION_MS` (600 ms, ease-out-cubic) with `d3-interpolate-path` (small, MIT; path interpolation that handles point-count changes), driven by `requestAnimationFrame` inside a `useTweenedPaths` hook keyed by band id; a band that appears grows from its baseline (flat path), a band that disappears shrinks to it before unmounting. The x axis, the break dividers and the bin markers move with a CSS transition on `transform` of the same duration. Nothing re-tweens on a pure re-render with identical data (memoised by a data key).
- **The pulse.** The bin that just received edits (the newest bin whose volume grew since the last answer) gets a one-shot highlight: a soft radial glow in the band's colour expanding and fading over `STREAMGRAPH_PULSE_MS` (900 ms), plus the band's stroke brightening and settling; one pulse per data change, never while the user is dragging a selection. The collapsed bar's chips pulse their count the same way when the panel is collapsed, so the person sees life even with the panel closed.
- **Live cue.** When edits arrive while the chart is on screen, a small "live" dot next to the Edits heading breathes once per change (`motion-reduce:animate-none`), labelled for assistive technology through `aria-live="polite"` text "N new edits" (throttled to one announcement per `LIVE_ANNOUNCE_MS`, 5 s).
- **Reduced motion.** `prefers-reduced-motion: reduce` disables the tween and the pulse: the chart snaps as today and only the live dot's text updates.
- **Performance.** The tween runs on at most `MAX_TWEENED_BANDS` (12) bands; beyond that it falls back to snapping. One `requestAnimationFrame` loop per chart, cancelled on unmount and when the panel collapses; no layout thrash (paths and transforms only).

### Failure handling

| Case | Behaviour |
|------|-----------|
| Path interpolation throws on a malformed path | the band snaps; a warn once per session |
| Data changes mid-tween | the running tween retargets from its current interpolated path |
| Panel collapsed | no tween runs; the chips pulse only |

## Test strategy summary

Unit: `useTweenedPaths` (tweens between two paths over the duration with a fake clock, retargets mid-tween, memo key suppresses re-tweens, reduced motion snaps, cap falls back), the pulse hook (one pulse per data change, none while selecting), the live cue (throttled announcement text). E2E (`e2e/timeline.spec.ts`): Bruno types in Ana's document; Ana's chart path `d` changes through at least three distinct intermediate values within the transition window (sampled with `requestAnimationFrame` through `page.evaluate`), the newest bin shows the pulse class, the live text announces; under emulated reduced motion no intermediate value appears.
