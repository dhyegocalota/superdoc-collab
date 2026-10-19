# Test plan: Readability in the editor and the timeline panel

A behaviour-preserving refactor: the lead ticks with the gate output and the reviewer refutes it (ADR 0030). No tester runs this plan. Every checkbox states the input and the exact expected outcome.

## Pinning tests

- [x] `features/editor/document-page.test.tsx`: green before and after step 1. A failed reload shows the reload message, a not-ready reload restarts waiting, an unavailable room and a not-ready document both show the waiting screen. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer
- [x] `features/timeline/timeline-panel.test.tsx`: green before and after step 2. The panel DOM and the phone layout are unchanged. The phone case where a bin selects without travelling is pinned by `use-bin-selection.test.ts`, red first at 088aa807. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer
- [x] `features/timeline/timeline-notices.test.tsx`: green before and after step 3. A projection behind by at least ten seconds shows the catching-up notice with the rounded lag; an unknown lag shows none. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer
- [x] The unit files beside every file touched in step 4. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer

## Unit

- [x] `pnpm typecheck` after the last step: zero errors. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer
- [x] `pnpm exec prettier --check` on every touched file: clean. — evidence: lead tick per ADR 0030 from the gate log scratchpad/webeditor-verify-1.log at 5d2f35fe (verify exit 0), refuted by the reviewer

## Coverage honesty

- No browser walk: nothing the user sees changes. The DOM is proven by the unit suites and by the E2E at the gate.
