# Test plan: Readability in the editor and the timeline panel

A behaviour-preserving refactor: the lead ticks with the gate output and the reviewer refutes it (ADR 0030). No tester runs this plan. Every checkbox states the input and the exact expected outcome.

## Pinning tests

- [ ] `features/editor/document-page.test.tsx`: green before and after step 1. A failed reload shows the reload message, a not-ready reload restarts waiting, an unavailable room and a not-ready document both show the waiting screen.
- [ ] `features/timeline/timeline-panel.test.tsx`: green before and after step 2. On a phone layout a bin tap selects without travelling.
- [ ] `features/timeline/timeline-notices.test.tsx`: green before and after step 3. A projection behind by at least ten seconds shows the catching-up notice with the rounded lag; an unknown lag shows none.
- [ ] The unit files beside every file touched in step 4.

## Unit

- [ ] `pnpm typecheck` after the last step: zero errors.
- [ ] `pnpm exec prettier --check` on every touched file: clean.

## Coverage honesty

- No browser walk: nothing the user sees changes. The DOM is proven by the unit suites and by the E2E at the gate.
