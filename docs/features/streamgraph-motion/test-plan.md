# Test plan: Streamgraph motion

Unit files run one at a time with `pnpm --filter @superdoc-collab/web exec vitest run <file>`. The tester ticks the walk rows.

## Unit

- [x] `use-tweened-paths.test.ts` — expected: 14 passed
- [x] `use-timeline-change.test.ts` — expected: 9 passed
- [x] `use-change-pulse.test.ts` — expected: 6 passed
- [x] `use-live-announcement.test.ts` — expected: 5 passed
- [x] `live-cue.test.tsx` — expected: 3 passed
- [x] `streamgraph.test.tsx` — expected: 66 passed
- [x] `streamgraph-layout.test.ts` — expected: 26 passed
- [x] `timeline-collapsed-bar.test.tsx` — expected: 9 passed
- [x] `timeline-panel.test.tsx` — expected: 58 passed
- [x] `timeline-copy.test.ts` — expected: 12 passed

## E2E

- [x] `pnpm exec playwright test e2e/timeline.spec.ts` — expected: 9 passed, including the tween walk and the reduced motion walk (evidence: 10 passed with `e2e/timeline-idle-gaps.spec.ts`, 2.0 min)

## Walk (tester, Playwright MCP recorded)

- [x] Ana opens the Edits panel, Bruno types in her document — evidence: a per-frame sampler on Ana's first band path recorded 97 distinct `d` values between 3372 and 3972 ms (600 ms, about 6 ms apart, first and last values e.g. `M0,44.46…`, `M0,43.49…`, `M0,42.90…`, `M0,42.59…`, `M0,42.48…`, `M0,42.46…`); the animations running in that window were streamgraph-pulse-glow, streamgraph-band-brighten and live-cue-breath; the text "1 new edit" appeared in the polite live region; a second run gave 64 values at 375; .pr-media/testing2/motion-mid-tween-1-1280.png and .pr-media/testing2/motion-mid-tween-2-1280.png show the orange glow at the newest bin, the brightened bands and the dot growing — expected: the bands glide over about 0.6 s, the newest bin glows in the band colour for about 0.9 s, the dot next to Edits breathes once, "1 new edit" is announced
- [x] Emulate reduced motion and repeat — evidence: `emulateMedia({reducedMotion:'reduce'})` (matchMedia reported true); after Bruno typed, the sampler saw 2 path changes (the snap, then the server's second answer, as the briefing warns), no running animation at all, no pulse element in the chart, and "1 new edit" still in the live region; .pr-media/testing2/motion-reduced-after-change-1280.png — expected: the bands snap, no glow, no breathing dot, the announcement text still appears
- [x] Press the pointer on the chart and hold while Bruno types — evidence: with the pointer down the band paths still tweened (98 path changes) but no streamgraph-pulse-glow or streamgraph-band-brighten ran (only the header dot's live-cue-breath and a generic pulse); after release and a later edit both animations ran again; note: the press selects a moment and the page URL gained `?at=`, Back to live clears it — expected: no glow until a later change
- [x] Collapse the bottom panel and repeat — evidence: with the panel collapsed and Bruno typing, a `chip-pulse-ring` animation ran on the Bruno chip for 895 ms (5197 to 6092 ms in the sampler); .pr-media/testing2/motion-collapsed-chip-ring-1280.png — expected: the chip of the band that grew shows a ring that fades
- [ ] Drag the panel edge wider — expected: the chart follows the drag with no 0.6 s lag — FAILED for the dividers: on a plain document the bands reach their final path in the same frame as the final width (11 widths, 0 ms lag; .pr-media/testing2/motion-side-panel-after-drag-1280.png); on the showcase document, which has idle breaks, the dashed dividers trail the bands: 162 widths, the dividers reach their final x 166 frames and 519 ms after the final width, with 8 streamgraph-glide animations running during the drag; the bands snap while the dividers drift
- [x] A document with an idle break — expected: the dashed divider glides when the chart rescales — evidence: on the showcase document (8 dashed `line.streamgraph-glide` dividers, 600 ms, `--glide-offset`) the dividers glide when the chart width changes (see the drag row); an admin edit inside the last bin did not rescale the time axis, so a data-driven rescale was not triggered; .pr-media/testing2/motion-showcase-panel-1280.png

## Edge cases found during execution (tester run 2026-10-19, second walk)

- [x] 375 px, bottom panel open, Bruno types — evidence: 64 distinct path values, document scrollWidth 375 on every frame (min and max), no sideways scroll; {M}motion-mid-tween-1-375.png, {M}motion-mid-tween-2-375.png
- [x] The timeline answer arrives about 1.6 s after Bruno's last key (522 ms after a call that began 1.1 s after the typing)
- [ ] Dividers lag a panel drag by about 0.5 s while the bands do not — FAILED against "the chart follows the drag": see the drag row; needs a regression test that a width change snaps the dividers like the bands (keep the glide for a data rescale only)
- [x] Tool note: the Playwright MCP calls of one block run one after another, so the sampler is installed first, the other author types in the next call and the result is read in a third call
