# Plan: Edits panel empty state

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/timeline/timeline-panel.tsx`

## Steps

- [x] **Step 1:** red tests: collapsed at every width, the empty state, the container padding (commit a9d05edf).
- [x] **Step 2:** `isPanelOpenByDefault` answers false; `PanelEmptyState` replaces the body of an open panel with no edits; the editor container gains `pt-3` (commit 0104efa2).
- [x] **Step 3:** unit tests that assumed an open panel expand it first (`document-page.test.tsx`, `time-travel.test.tsx`).
- [x] **Step 4:** E2E helper `expandPanel` in `e2e/timeline.ts`, called by the band, chart, filter and key helpers; specs that read the panel after a reload or a direct locator call it themselves; new E2E for the collapsed start and the empty state.
- [x] **Step 5:** screenshots of the collapsed start, the empty state and the page margin at 1280 and 375, under `.pr-media/edits-panel-empty-state/` (git-ignored).

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A summarize on an empty document no longer shows the card | `document-page.test.tsx` summarize case | give that test a timeline with edits |
| 4 | A spec asserts the collapsed bar and an auto-expand hides it | `final-visuals.spec.ts` bar cases | call `expandPanel` explicitly instead of in the helper |

**Steps with no backout:** none.
