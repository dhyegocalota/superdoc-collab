# A spec that reads a call counter off the fake upstream passes alone and fails as soon as its file runs in parallel

- Date: 2026-10-17
- Inspired by: the `faster-ci` measurement of `pnpm test:e2e --fully-parallel --workers=4` (`docs/features/faster-ci/plan.md` Step 8, ADR 0014): `selection-summary.spec.ts:49` expected 3 calls and received 10
- Revisited: 2026-10-17

## Signal
A green E2E spec starts failing on an exact-count assertion (`expected 3, received 10`) only when the suite runs with more workers or with `fullyParallel`; it passes alone and passes under file-level parallelism.

## Cause
`readSelectionCalls` reads one counter on the fake OpenRouter that counts every selection call from every document. Under file-level parallelism all the specs of a file share one worker and run in order, so the deltas are stable; `fullyParallel` spreads the file's specs over workers and their model calls interleave into the same counter.

## Do
Keep the suite on file-level parallelism, which is what ADR 0014 adopted, and never turn on `fullyParallel` while any spec asserts a process-wide count. When a file must run its specs in parallel, make the fake count per document (key the counter by the document id it can read from the prompt) and assert the per-document delta.

## Anchor
`e2e/timeline.ts` (`readSelectionCalls`), `e2e/fake-openrouter.ts`, `e2e/selection-summary.spec.ts:49`, `playwright.config.ts` (no `fullyParallel`), ADR 0014
