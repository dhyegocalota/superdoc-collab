# Tester briefing: Edits panel empty state

## What changed

- The edits panel starts collapsed at every width on every open; the choice lasts until the page unloads.
- An open panel with no edits shows the history illustration, "No edits yet" and one sentence instead of the chart and lists.
- The editor container has `pt-3`, so the first page clears the toolbar row.

## Red today, green after

| Test | Red text | Commit |
|------|----------|--------|
| `use-panel-position.test.tsx` collapsed at every width | `expected true to be false` | a9d05edf |
| `timeline-panel.test.tsx` empty state | `Unable to find an element by: [data-testid="panel-empty-state"]` | a9d05edf |
| `superdoc-editor.test.tsx` padding | `expect(element).toHaveClass("pt-3")` | a9d05edf |
| `timeline-collapsed-bar.test.tsx` empty timeline | pin, green on arrival | 0104efa2 |

## Hypotheses to check

- A new document opens with the collapsed bar at 1280, 1536 and 375, and the bar shows the heading and the toggle only.
- Expanding shows the empty state centred; typing a paragraph replaces it with the chart.
- Reloading collapses the panel again.
- The first page's outline and shadow no longer touch the toolbar at 1280 and 375.
- The print frame and the version viewer keep their old spacing.
- Summarize on an empty document opens the panel on the empty state, not the card.

## Left out

- `timeline-notices.tsx` still renders "No edits yet" and its own test; the panel no longer reaches that branch. Removal is for a follow-up.
- `isPanelOpenByDefault` now always answers false; `document-page.tsx` could start the state at false and drop the function.
- Two files outside the ownership list changed with the lead informed: `document-page.test.tsx` and `time-travel.test.tsx` expand the panel first.
- `summary-mobile.spec.ts` matches the View version button exactly, because the edit row button "View version after this edit" also matches the plain name.

## E2E and screenshots

- Specs that needed the expand step: final-visuals, selection-summary, showcase, time-travel, timeline, timeline-idle-gaps, topics-on-open. The helpers in `e2e/timeline.ts` expand on their own.
- New E2E: `a new document opens with the panel collapsed, expands to the empty state and shows the chart once edited` in `e2e/timeline.spec.ts`.
- Screenshots in `.pr-media/edits-panel-empty-state/`: `collapsed-1280.png`, `collapsed-375.png`, `empty-state-1280.png`, `empty-state-375.png`, `page-margin-1280.png`, `page-margin-375.png`.
- At 375 the bottom panel already extends below the fold, so the description line is cut at the viewport edge.
