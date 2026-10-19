# Test plan: Edits panel empty state

## Red (commit a9d05edf)

- [x] `use-panel-position.test.tsx`: the panel starts collapsed at every width — failed: `AssertionError: expected true to be false // Object.is equality`
- [x] `timeline-panel.test.tsx`: a document without edits shows one empty state — failed: `TestingLibraryElementError: Unable to find an element by: [data-testid="panel-empty-state"]`
- [x] `superdoc-editor.test.tsx`: the container carries the top padding — failed: `expect(element).toHaveClass("pt-3")`

## Green

- [x] `vitest run` in `apps/web` — expected: all pass (evidence: 132 files, 1093 tests)
- [x] `pnpm typecheck` — expected: clean (evidence: web, server and e2e done)
- [x] `pnpm test:e2e e2e/timeline.spec.ts e2e/documents.spec.ts` — expected: all pass (evidence: 7 passed for timeline.spec after the last change; earlier combined run of 11 specs, 79 passed)
- [x] E2E for every spec that reads the panel (agent, documents, final-visuals, selection-summary, settings, showcase, summary-mobile, time-travel, timeline, timeline-idle-gaps, topics-on-open) — expected: all pass (evidence: 79 passed)
- [x] Screenshots at 1280 and 375: collapsed start, empty state expanded, page margin (evidence: `.pr-media/edits-panel-empty-state/`)
