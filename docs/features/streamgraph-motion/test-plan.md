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

- [ ] Ana opens the Edits panel, Bruno types in her document — expected: the bands glide over about 0.6 s, the newest bin glows in the band colour for about 0.9 s, the dot next to Edits breathes once, "1 new edit" is announced
- [ ] Emulate reduced motion and repeat — expected: the bands snap, no glow, no breathing dot, the announcement text still appears
- [ ] Press the pointer on the chart and hold while Bruno types — expected: no glow until a later change
- [ ] Collapse the bottom panel and repeat — expected: the chip of the band that grew shows a ring that fades
- [ ] Drag the panel edge wider — expected: the chart follows the drag with no 0.6 s lag
- [ ] A document with an idle break — expected: the dashed divider glides when the chart rescales
