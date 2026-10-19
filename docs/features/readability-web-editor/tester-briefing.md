# Tester briefing: Readability in the editor and the timeline panel

Written by the developer. No tester runs this lane; the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## What changed

- `features/editor/document-page.tsx`: the reload flow lives in `use-document-reload.ts`, the failure button action in `use-connection-failure-action.ts`, the status lines in `editor-status.tsx`, the editor and version frame in `editor-surface.tsx` and the version banner with its progress line in `version-bar.tsx`. The two waiting branches are one, and both reload catch paths share one remount.
- `features/timeline/timeline-panel.tsx`: the header, the chart, the edits, the filter, the sizing and the two layouts moved to `panel-header.tsx`, `panel-chart.tsx`, `panel-edits.tsx`, `panel-filter.tsx`, `use-panel-frame.ts`, `side-panel-body.tsx` and `bottom-panel-body.tsx`. `PanelState` and `PanelColumn` moved to `panel-layout.ts`.
- `features/timeline/use-bin-selection.ts`: `onTravel` is nullable, so the phone layout passes `null` instead of a no-op.
- `features/timeline/timeline-notices.tsx`: the lag notice carries its rounded seconds, with no non-null assertion.
- A compound condition named in `use-connection-state.ts` and `use-reveal-selected.ts`, and `cachedTitleOf` in `waiting-for-document.tsx` takes named parameters.

## How to run

Run each touched unit file through the web package's test script, then `pnpm typecheck`.

## Red today, green after

- `use-bin-selection.test.ts`, test "selecting a bin with a version only selects it when there is no travel handler": red at 088aa807 with `TypeError: onTravel is not a function`, green at 0c8ccc7a.
- Pins, green before and after: `document-page.test.tsx` (56), `timeline-panel.test.tsx` (61), `timeline-notices.test.tsx` (the two lag tests landed with 043053a4 as pins), `waiting-for-document.test.tsx`, `use-connection-state.test.ts` and `use-reveal-selected.test.ts`.

## Hypotheses to attack

1. Hypothesis: a reload answered 409 restarts the waiting screen and still remounts the editor once. Break it by: failing the reopen with a conflict, then watching the editor generation and the connection banner.
2. Hypothesis: the panel keeps its chart width across a collapse and reopen. Break it by: collapsing the panel, resizing the window, reopening it.
3. Hypothesis: the lag notice appears from ten seconds and shows the rounded seconds. Break it by: a projection behind by 14.6 seconds and by 9.9 seconds.
4. Hypothesis: on a phone layout tapping a bin never travels, and the View version button does. Break it by: tapping a bin that has a version below the medium breakpoint.

## Known gaps

See the spec.
