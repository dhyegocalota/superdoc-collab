# Plan: The Edits panel on a phone

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `TimelinePanel` (layout and the new header), `useTimeTravel` (the two-step), `document-page.tsx` and `version-banner.tsx` (the loading state and the pinned bar), `Streamgraph` (taps while loading).
**Assumptions (decided, owner can override):**
- "Phone" means below the `lg` breakpoint, the same rule that collapses the panel by default.
- The two-step applies only to bins with a version; a bin without one selects on the first tap as today.
- The progress line and the dimmed editor show on every width; the pinned bar and the two-step only below `lg`.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/timeline/selected-header.tsx`, `selected-header.test.tsx`, `use-reveal-selected.ts`, `use-reveal-selected.test.ts`, `apps/web/src/lib/use-reduced-motion.ts`, `use-reduced-motion.test.ts`, `timeline-panel.tsx`, `timeline-panel.test.tsx`, `use-panel-width.ts`, `use-panel-width.test.ts`, `timeline-copy.ts`, `timeline-copy.test.ts`, `use-time-travel.ts`, `time-travel.test.tsx` (versions folder), `streamgraph.tsx`, `streamgraph.test.tsx`, `apps/web/src/features/versions/version-banner.tsx` and its test, `apps/web/src/features/editor/document-page.tsx`, `document-page.test.tsx`, `apps/web/src/components/ui/button.tsx`, `e2e/summary-mobile.spec.ts` (new) or `e2e/final-visuals.spec.ts`, `docs/features/README.md` (this fix's row) | `developer-sm` |

## Sequencing

One developer, steps in order: the header and reveal (1-3), the two-step (4), the loading state (5-6), the skeleton and the share (7), E2E (8).

## Steps

### G1

- [ ] **Step 1:** red tests for `SelectedHeader` (four states) and the copy; the component; green.
- [ ] **Step 2:** red tests for `useReducedMotion` and `useRevealSelected`; the hooks; green.
- [ ] **Step 3:** red test for the panel's phone order (chart, header, filter, card, edits) with the header sticky; the layout; green.
- [ ] **Step 4:** red tests for `useTimeTravel`: below `lg` a versioned bin sets `pendingVersion` and `confirmTravel` travels; at `lg` the tap travels; the hook and the header's "View version"; green.
- [ ] **Step 5:** red tests for `Streamgraph` ignoring taps and marking `aria-busy` while loading; the prop; green.
- [ ] **Step 6:** red tests for `document-page` (dimmed editor and progress line while a version loads, the pinned bar below `lg`) and `version-banner`; the `touch` size variant; green.
- [ ] **Step 7:** red tests for the timeline skeleton on first load and the phone share constant; green.
- [ ] **Step 8:** E2E at 375 x 812 (tap, pinned header in view, two-step, loading, Back to live) and one desktop assertion that a tap still travels; `pnpm typecheck`; tester briefing; the README row.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 3 | `position: sticky` inside the scroll container does not stick because an ancestor has `overflow` set | the header scrolls away in the walk at 375 | the sticky header moves outside the scrolling list, as a sibling above it |
| 4 | the pending state desyncs from the selection after a keyboard move | the "View version" button names a bin that is no longer selected | `pendingVersion` derives from the selected bin, not from a separate store |
| 5 | ignoring taps while loading also blocks the keyboard | arrow keys do nothing during a load | only pointer events are ignored; keys keep working |
| 6 | the dimmed editor leaves the toolbar interactive | typing changes the live doc while a version shows | the dim is applied to the same area the failed state already covers |
| 8 | the E2E needs two minutes of edits to get a versioned bin | the test takes too long under five workers | reuse the helpers the final-visuals spec uses to seed bins and versions |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots at 375, 320 and 1280 in both themes and the video.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
