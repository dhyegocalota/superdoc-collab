# An E2E that finds a scroll container by a class substring picks a responsive variant on a box-less wrapper

- Date: 2026-10-18
- Inspired by: the summary-mobile review (`e2e/summary-mobile.spec.ts`): the reviewer's Chromium probe showed the overflow and position assertions failing at 375 px
- Revisited: 2026-10-18 — still true; the spec now locates the panel body by `data-panel-body`

## Signal
At a phone width an assertion that the scroller overflows (`scrollHeight > clientHeight`) fails, and the rects read for the scroller are all zero, although the panel visibly scrolls.

## Cause
The locator `ancestor::*[contains(@class, "overflow-y-auto")][1]` matches the class text `md:overflow-y-auto`, a responsive variant that does not apply at phone width. It sits on the chart column wrapper, which is `display: contents` below `md`: an element with no box, so its scrollHeight and rects are 0. The real scroller is a further ancestor.

## Do
Mark layout anchors with data attributes (`data-panel-body`, `data-column`) and locate by them. Never find an element by class text, because Tailwind class strings carry every breakpoint variant whether it applies or not.

## Anchor
`e2e/summary-mobile.spec.ts`, `apps/web/src/features/timeline/timeline-panel.tsx` (`data-panel-body`, `data-column`), the reviewer's Chromium probe of 2026-10-18
