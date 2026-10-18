# Plan: The Edits panel on a phone

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `TimelinePanel` (layout and the new header), `useTimeTravel` (the two-step), `document-page.tsx` and `version-banner.tsx` (the loading state and the pinned bar), `Streamgraph` (taps while loading).
**Assumptions (decided, owner can override):**
- "Phone" means below the `lg` breakpoint, the same rule that collapses the panel by default.
- The two-step applies only to bins with a version; a bin without one selects on the first tap as today.
- The progress line and the dimmed editor show on every width; the pinned bar, the chart lock and View version only below `lg`.
- The side panel below `lg` cannot happen: `use-panel-position.ts` forces the bottom position.
- The panel's height share is not changed.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/timeline/selected-header.tsx`, `selected-header.test.tsx`, `use-reveal-selected.ts`, `use-reveal-selected.test.ts`, `apps/web/src/lib/use-reduced-motion.ts`, `use-reduced-motion.test.ts`, `timeline-panel.tsx`, `timeline-panel.test.tsx`, `use-panel-width.ts`, `use-panel-width.test.ts`, `timeline-copy.ts`, `timeline-copy.test.ts`, `use-time-travel.ts`, `time-travel.test.tsx` (versions folder), `streamgraph.tsx`, `streamgraph.test.tsx`, `apps/web/src/features/versions/version-banner.tsx` and its test, `apps/web/src/features/editor/document-page.tsx`, `document-page.test.tsx`, `apps/web/src/components/ui/button.tsx`, `e2e/summary-mobile.spec.ts` (new) or `e2e/final-visuals.spec.ts`, `docs/features/README.md` (this fix's row) | `developer-sm` |

## Sequencing

One developer, steps in order: the header and reveal (1-3), the two-step (4), the loading state (5-6), the skeleton and the share (7), E2E (8).

## Steps

### G1

- [x] **Step 1:** red tests for `SelectedHeader` (four states) and the copy; the component; green. — evidence: red 3f20e65, green a0dd53c (`selected-header.test.tsx`, `timeline-copy.test.ts`); `viewVersionPrompt` dropped, the header names the range already; the `touch` button variant landed here because the header uses it
- [x] **Step 2:** red tests for `useReducedMotion` and `useRevealSelected`; the hooks; green. — evidence: red b155fe9, green f9444b4 (`use-reduced-motion.test.ts`, `use-reveal-selected.test.ts`)
- [x] **Step 3:** red test for the panel's phone order (chart, header, filter, card, edits) with the header sticky; the layout; green. — evidence: red 287564d, green 06f0415 (`timeline-panel.test.tsx`); the first-load skeleton of step 7 landed in the same pair
- [x] ~~**Step 4:** red tests for `useTimeTravel`: below `lg` a versioned bin sets `pendingVersion` and `confirmTravel` travels; at `lg` the tap travels; the hook and the header's "View version"; green.~~ Superseded by R2: no pending state. — evidence: red b6913df, green 465ba4d (`time-travel.test.tsx`, `timeline-panel.test.tsx`)
- [x] **Step 5:** red tests for `Streamgraph` ignoring taps and marking `aria-busy` while loading; the prop; green. — evidence: red bc07597, green 5eec8af (`streamgraph.test.tsx`); `aria-busy` sits on the chart svg, not on a bin, because a bin is not an element
- [x] **Step 6:** red tests for `document-page` (dimmed editor and progress line while a version loads, the pinned bar below `lg`) and `version-banner`; the `touch` size variant; green. — evidence: red 0fc9a8c, green 005a892 (tests live in `time-travel.test.tsx`, which already holds the version fixtures; `document-page.test.tsx` passes unchanged); the `touch` variant is from step 1
- [x] **Step 7:** red tests for the timeline skeleton on first load and ~~the phone share constant~~ (struck: the pinned header is the fix and a smaller share would push it under the fold at 375 x 812; reverted in R1, 3b70dea); green. — evidence: red e374fa6, green 24489b0 (`use-panel-width.test.ts`); the skeleton is from step 3
- [x] **Step 8:** E2E at 375 x 812 (tap, pinned header in view, two-step, loading, Back to live) and one desktop assertion that a tap still travels; `pnpm typecheck`; tester briefing; the README row. — evidence: E2E 718aa4d (`e2e/summary-mobile.spec.ts`, not run by the developer); `pnpm typecheck` green; README row; tester briefing

### Rework after the plan review (binding decisions of the lead)

- [x] **R1:** revert the panel height share to 58 percent with its tests; the skeleton copy becomes `LOADING_TIMELINE_LABEL` and `components/ui/skeleton.tsx` gains `motion-reduce:animate-none`. — evidence: red 87aaae8, green 3b70dea
- [x] **R2:** no pending state: selecting never travels below `lg`; View version calls `onTravel` which writes `at` at once below `lg`; `canViewVersion` derives from the selected bin and `at`; remove `pendingVersion`, `confirmTravel`, `VersionReference`. — evidence: red 37037d3, green cc731fa (`selected-header.test.tsx`, `timeline-panel.test.tsx`, `time-travel.test.tsx`)
- [x] **R3:** loading ends on frame ready (`VersionFrame.onReady`); the chart lock and the disabled View version apply below `lg` only and only with a requested sequence; `aria-busy` on the chart wrapper. — evidence: red 37037d3, green cc731fa (frame-ready end of loading, phone-only lock, `aria-busy` on the wrapper)
- [x] **R4:** the dim moves to the inner editor div with its own test id; below `lg` the bar renders before the layout div and drops its sticky classes. — evidence: red 7fd37e0, green f47b5d2
- [x] **R5:** reveal on pointer selections only; header placement from `md` to `lg` at the top of the list column; the header's parent is the scroller below `md`. — evidence: header placement in 37037d3/cc731fa; reveal red (see log: test(summary-mobile): only a pointer press reveals the header, red), green 59e8f2a
- [x] **R6:** E2E helper in `e2e/timeline.ts`; tester briefing and this plan follow. — evidence: E2E helper and spec updated, `pnpm typecheck` green; briefing rewritten

- [x] **R7 (reviewer findings):** header counts characters with the existing helper; the progress line sits right under the bar; View version by bin index; dim and progress line need a requested version; one `useIsPhoneLayout`, one `useMediaQuery`, one `writeAt`; the E2E proves the reveal and the sticky header against the scroller — evidence: red e774709, green d800802 and 4f213db; red be8907c, green 4d0d339 and 474df3f; refactors d40c0b6, 65213dc, 8b61460; E2E in the commit after 8b61460

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 3 | `position: sticky` inside the scroll container does not stick because an ancestor has `overflow` set | the header scrolls away in the walk at 375 | the sticky header moves outside the scrolling list, as a sibling above it |
| 4 | View version names a bin other than the selected one | the button shows for the bin already viewed | `canViewVersion` derives from the selected bin and `at` only |
| 5 | ignoring taps while loading leaves the chart dead | an `at` with no version never unlocks | the lock needs a requested sequence and ends on frame ready; keys keep working |
| 6 | the dim covers the version bar | the bar is dimmed during a load | the dim sits on the inner editor div only |
| 8 | the E2E needs two minutes of edits to get a versioned bin | the test takes too long under five workers | reuse the helpers the final-visuals spec uses to seed bins and versions |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots at 375, 320 and 1280 in both themes and the video.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
