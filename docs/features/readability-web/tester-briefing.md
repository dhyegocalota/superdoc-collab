# Tester briefing: Readability in the web app

Written by the developer. No tester runs this lane; the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## What changed

- `components/ui/form.tsx`: `FormMessage` reads `error.message` instead of defaulting to an empty string. `form.test.tsx` is a pin written first.
- `testing/match-media.ts` and `testing/print-frame.ts`: shared doubles. The theme and panel position tests use the first; the print view and download menu tests use the second.
- `features/timeline/streamgraph.tsx`: now composes `StreamgraphBands`, `IdleBreakMarkers`, `SelectionMarker` and `StreamgraphTooltip`, with pointer and focus state in `useStreamgraphInteraction` and key stepping in `nextIndex`.
- `features/timeline/use-time-travel.ts`: the pin, load and frame state moved to `use-version-pin.ts`. The return shape is unchanged.
- `features/versions/print-page.tsx`: the painted pages loop moved to `use-painted-pages-report.ts`; `postToParent` moved to `print-messages.ts`.
- `features/documents`: the list request subject moved to the copy file.
- Six names nobody else imports stop being exported.

## How to run

Run each touched unit file through the web package's test script, then `pnpm typecheck`.

## Red today, green after

None. Every test is a pin: green before and after each commit.

## Hypotheses to attack

1. Hypothesis: the streamgraph renders the same DOM in the same order. Break it by: diffing the rendered markup of a timeline with agent actions, idle breaks and a selection before and after.
2. Hypothesis: the failed-frame reset still runs on every change of the viewed time. Break it by: failing a frame, then moving to another bin, and checking the banner.
3. Hypothesis: no import cycle between `use-streamgraph-interaction.ts` and `streamgraph-bands.tsx`. Break it by: the bundle build.

## Known gaps

See the spec.
