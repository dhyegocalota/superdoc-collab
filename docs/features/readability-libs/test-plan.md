# Test plan: Readability in the libraries

A behaviour-preserving refactor: the reviewer and `pnpm verify` are the proof, and no tester runs this plan. Every checkbox states the input and the exact expected outcome.

## The failing test first

- [ ] `libs/types/src/text.test.ts::isBlank` — input: `''`, `'   '`, `' \n\t'`, `'Ana'`, `' Ana '`; expected: `true, true, true, false, false`. Red on: `isBlank` is not a function.

## Pinning tests

- [ ] `libs/history/src/timeline/runs.test.ts` and `bins.test.ts` — green before and after step 1.
- [ ] The unit files beside the five call sites — green before and after step 2.

## Unit

- [ ] `pnpm typecheck` after the last step: zero errors.
- [ ] `pnpm exec prettier --check` on every touched file: clean.

## Coverage honesty

- No browser walk: nothing the user sees changes.
