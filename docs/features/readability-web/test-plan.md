# Test plan: Readability in the web app

A behaviour-preserving refactor: the lead ticks with the gate output and the reviewer refutes it (ADR 0030). No tester runs this plan. Every checkbox states the input and the exact expected outcome.

## Pinning tests

- [ ] The form unit tests: green before and after step 1. An invalid field shows its message, a valid field shows its children, an empty message renders nothing.
- [ ] `lib/use-theme.test.tsx`, `features/timeline/use-panel-position.test.tsx`, `features/versions/print-view.test.tsx` and `features/editor/download-menu.test.tsx`: same assertions before and after step 2.
- [ ] `features/timeline/streamgraph.test.tsx`: green before and after step 3.
- [ ] `features/versions/time-travel.test.tsx`: green before and after step 4.
- [ ] The unit files beside every file touched in steps 5 and 6.

## Unit

- [ ] `pnpm typecheck` after the last step: zero errors.
- [ ] `pnpm exec prettier --check` on every touched file: clean.

## Coverage honesty

- No browser walk: nothing the user sees changes. The streamgraph DOM is proven by the unit suite and by the E2E at the gate.
