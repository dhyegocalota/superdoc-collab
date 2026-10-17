# Test plan: Spec-only rulings

Every box states the input and the exact expected outcome; a ticked box carries ` — evidence: <commit | log | run>`. No UI changed, so there is no Playwright walk and no media.

## The failing test first

- [ ] `libs/history/src/timeline/bins.test.ts::a span of 7140000 ms never draws more than MAX_BINS bins` — input: 119 minutes at offsets 0 s, 5 s, 59 s; expected before the fix: `expected 122 to be less than or equal to 120`.
- [ ] Confirmed it fails for the right reason: the count comes from `binStartsCovering`, not from `chooseBinMs` arithmetic.

## Unit

- [ ] `pnpm --filter @superdoc-history/history test:unit` — expected: every test green, including the seven `chooses the finest bin that fits` pairs unchanged.
- [ ] `pnpm --filter @superdoc-history/server test:unit -- src/insights/topics-service.test.ts src/documents/share-links-routes.test.ts src/documents/share-links.test.ts` — expected: green; these are the tests ADRs 0014 and 0016 cite as evidence.
- [ ] `pnpm typecheck` — expected: exit 0.
- [ ] Edge: a 3-year span still falls back to a whole number of weeks and the count stays within 120 — covered by `three years fall back to a whole number of weeks` and the budget test's last span.

## Documentation

- [ ] Every path and test name cited under `## Evidence` in ADRs 0014, 0015 and 0016 exists (`ls` the file, `grep` the test name).
- [ ] `docs/adr/README.md` index lists 0014, 0015 and 0016 with the same titles as their files.
- [ ] ADR 0011's status line links to 0014 and the link resolves.
- [ ] Every `// NB ADR NNNN:` line in the repo names an ADR that exists, and its sentence agrees with that ADR's Decision section (`grep -rn "NB ADR" apps libs`).

## Convention hook

- [ ] A `.ts` file with one `// NB ADR 0014: x` line and one `// plain` line — expected: exactly one warning, mentioning "only '// NB ADR NNNN:' pointers are allowed".
- [ ] A `.ts` file with only the `NB ADR` line — expected: no warning.

## Adversarial review

- [ ] Claim 1: the padding is the only reason the count exceeded the cap — attack: search for other callers of `chooseBinMs` or other bin producers; result: <refuted | held>
- [ ] Claim 2: no ladder pair in the existing test changes step after budgeting three extra bins — attack: compute each pair by hand; result: <refuted | held>
- [ ] Claim 3: the `NB` sentences state the ADR's rule and nothing else — attack: read each against its ADR; result: <refuted | held>

## Coverage honesty

- The 16 ms render budget behind `MAX_BINS` is the spec's measurement, not re-measured here.
- The hook is checked by hand, not by an automated test; it is a warning, never a gate.
