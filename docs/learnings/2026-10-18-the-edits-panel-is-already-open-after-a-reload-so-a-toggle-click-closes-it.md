# A spec waits for a chart band after clicking the Edits toggle and times out on the band

- Date: 2026-10-18
- Inspired by: `e2e/timeline-idle-gaps.spec.ts`, failing in `waitForBands` for 60 s after a reload and a click on the Edits toggle

## Signal
The wait for the `Budget` band path times out with "element(s) not found". The page snapshot shows the collapsed bar (the Edits heading, the topic chips and the panel handle) and no chart, so the failure reads like missing data or a broken layout.

## Cause
On a large viewport the Edits panel is open by default, and a reload restores that default. Clicking the toggle after the reload therefore closes it. The band wait then masks the real cause, because a closed panel has no band paths.

## Do
After a reload on a desktop viewport, wait for the chart itself and click the toggle only when the spec needs it closed or the viewport is a phone. When a wait for a band times out, read the page snapshot for the collapsed bar before suspecting the data.

## Anchor
- `e2e/timeline-idle-gaps.spec.ts`, commit `b02bac9`
- `apps/web/src/features/timeline/use-panel-position.ts` (`isPanelOpenByDefault`)
- `e2e/summary-mobile.spec.ts` clicks the toggle after a reload on a phone viewport, where the panel starts closed
