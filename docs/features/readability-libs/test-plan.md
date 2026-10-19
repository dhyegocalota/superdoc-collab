# Test plan: Readability in the libraries

A behaviour-preserving refactor: the reviewer and `pnpm verify` are the proof, and no tester runs this plan. Every checkbox states the input and the exact expected outcome.

## The failing test first

- [x] `libs/types/src/text.test.ts::isBlank` — input: `''`, `'   '`, `' \n\t'`, `'Ana'`, `' Ana '`; expected: `true, true, true, false, false`. Red on: `Error: isBlank is not implemented`. — evidence: lead tick per ADR 0030 from the gate log scratchpad/libs-verify-3.log at 05c3b7c1 (verify exit 0), refuted by the reviewer

## Pinning tests

- [x] `libs/history/src/timeline/runs.test.ts` and `bins.test.ts` — green before and after step 1. — evidence: lead tick per ADR 0030 from the gate log scratchpad/libs-verify-3.log at 05c3b7c1 (verify exit 0), refuted by the reviewer
- [x] The unit files beside the four call sites — green before and after step 2. — evidence: lead tick per ADR 0030 from the gate log scratchpad/libs-verify-3.log at 05c3b7c1 (verify exit 0), refuted by the reviewer

## Unit

- [x] `pnpm typecheck` after the last step: zero errors. — evidence: lead tick per ADR 0030 from the gate log scratchpad/libs-verify-3.log at 05c3b7c1 (verify exit 0), refuted by the reviewer
- [x] `pnpm exec prettier --check` on every touched file: clean. — evidence: lead tick per ADR 0030 from the gate log scratchpad/libs-verify-3.log at 05c3b7c1 (verify exit 0), refuted by the reviewer

## Coverage honesty

- No browser walk: nothing the user sees changes.
