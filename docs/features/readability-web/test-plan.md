# Test plan: Readability in the web app

A behaviour-preserving refactor: the lead ticks with the gate output and the reviewer refutes it (ADR 0030). No tester runs this plan. Every checkbox states the input and the exact expected outcome.

## Pinning tests

- [x] The form unit tests: green before and after step 1. An invalid field shows its message, a valid field shows its children, an empty message renders nothing. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer
- [x] `lib/use-theme.test.tsx`, `features/timeline/use-panel-position.test.tsx`, `features/versions/print-view.test.tsx` and `features/editor/download-menu.test.tsx`: same assertions before and after step 2. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer
- [x] `features/timeline/streamgraph.test.tsx`: green before and after step 3. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer
- [x] `features/versions/time-travel.test.tsx`: green before and after step 4. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer
- [x] The unit files beside every file touched in steps 5 and 6. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer

## Unit

- [x] `pnpm typecheck` after the last step: zero errors. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer
- [x] `pnpm exec prettier --check` on every touched file: clean. — evidence: lead tick per ADR 0030 from the gate log scratchpad/web-verify-1.log at 3fdd7d81 (verify exit 0), refuted by the reviewer

## Coverage honesty

- No browser walk: nothing the user sees changes. The streamgraph DOM is proven by the unit suite and by the E2E at the gate.
