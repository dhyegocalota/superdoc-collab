# Test plan: Spec-only rulings

Every box states the input and the exact expected outcome; a ticked box carries ` — evidence: <commit | log | run>`. No UI changed, so there is no Playwright walk and no media.

## The failing test first

- [x] `libs/history/src/timeline/bins.test.ts::a span of 7140000 ms never draws more than MAX_BINS bins` — input: 119 minutes at offsets 0 s, 5 s, 59 s; expected before the fix: `expected 122 to be less than or equal to 120`. — evidence: HEAD test file against bins.ts from 9a51f2f (identical to efb4f31): `x a span of 7140000 ms never draws more than MAX_BINS bins`, `AssertionError: expected 122 to be less than or equal to 120`, 1 failed | 16 passed; bins.ts restored with `git checkout --`, tree clean.
- [x] Confirmed it fails for the right reason: the count comes from `binStartsCovering`, not from `chooseBinMs` arithmetic. — evidence: assertion at bins.test.ts calls `binStartsCovering({ firstTime, lastTime, binMs }).length` with `binMs = chooseBinMs(spanMs)`; red value 122 is the real array length; the sibling pair/week tests passed on the old file (16 passed), so only the budget test fails. efb4f31 touches only bins.test.ts.

## Unit

- [x] `pnpm --filter @superdoc-history/history test:unit` — expected: every test green, including the seven `chooses the finest bin that fits` pairs unchanged. — evidence: 17 files, 81 tests passed; bins.test.ts alone 17 passed including the seven `chooses the finest bin that fits` pairs. Hand check with +3 extra bins: 30 s->10 s (6), 2 min->10 s (15), 10 min->10 s (63), 30 min->30 s (63), 3 h->2 min (93), 5 h->5 min (63), 30 d->12 h (63); every pair unchanged.
- [x] `pnpm --filter @superdoc-history/server test:unit -- src/insights/topics-service.test.ts src/documents/share-links-routes.test.ts src/documents/share-links.test.ts` — expected: green; these are the tests ADRs 0015 and 0017 cite as evidence. — evidence: green, 40 files passed | 2 skipped, 383 tests passed | 2 skipped. Note: the extra file arguments were ignored by the package script (it runs `vitest run "--" ...`), so the whole server suite ran, which includes the three cited files.
- [x] `pnpm typecheck` — expected: exit 0. — evidence: exit 0 (web, server and e2e typecheck all Done; exit code captured from `pnpm typecheck` itself).
- [x] Edge: a 3-year span still falls back to a whole number of weeks and the count stays within 120 — covered by `three years fall back to a whole number of weeks` and the budget test's last span. — evidence: `three years fall back to a whole number of weeks` and the 3*365*DAY_MS budget case both green in the 17 passing bins tests.

## Documentation

- [x] Every path and test name cited under `## Evidence` in ADRs 0015, 0016 and 0017 exists (`ls` the file, `grep` the test name). — evidence: all five files exist; `links stored under another secret are regenerated and work` at share-links-routes.test.ts:145; topic-assignment.test.ts has 'mostly covers' (half rule) and 'reused at most once'; topics-service.test.ts has the five-block, interval (fake timers) and busy tests; bins.test.ts budget test exists. Finding: ADR 0015 Consequences says `TOPIC_RECOMPUTE_MIN_INTERVAL_MS` carries an `NB ADR 0015` pointer, but topics-service.ts:14 has none (the pointers sit on TOPIC_RECOMPUTE_NEW_BLOCKS, keepsReadyTopics and matchPreviousTopics). The cited paths and tests exist, so the box passes; the sentence is a defect.
- [x] `docs/adr/README.md` index lists 0015, 0016 and 0017 with the same titles as their files. — evidence: README.md lines 36-38 list 0015, 0016, 0017 with titles identical to the `#` headings of the three files.
- [x] ADR 0011's status line links to 0015 and the link resolves. — evidence: line 3 of 0011 links `0015-topics-recompute-trigger-and-identity.md`; the file exists in docs/adr.
- [x] Every `// NB ADR NNNN:` line in the repo names an ADR that exists, and its sentence agrees with that ADR's Decision section (`grep -rn "NB ADR" apps libs`). — evidence: 9 code pointers (0002 edit-events.ts:50, 0003 version-marks.ts:12, 0011 insights-worker.ts:5, 0012 timeline.ts:13, 0015 x3, 0016 bins.ts:4, 0017 share-links.ts:29); ADRs 0002/0003/0011/0012/0015/0016/0017 all exist. Sentences agree with the Decision sections except: NB 0003 (minute granularity) is not in ADR 0003's Decision, only in its 2026-10-16 Addendum (line 62); NB 0012 'a cached summary costs nothing' is implied, not stated, in ADR 0012's Decision. Passes with those two notes.

## Convention hook

- [x] A `.ts` file with one `// NB ADR 0015: x` line and one `// plain` line — expected: exactly one warning, mentioning "only '// NB ADR NNNN:' pointers are allowed". — evidence: piped hook input for /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-requirements/24528e4e-551f-43a1-afe2-750004f4ef3e/scratchpad/mixed.ts: stderr `Convention warning in mixed.ts: comment found; the code must explain itself (only '// NB ADR NNNN:' pointers are allowed).` once, exit 0.
- [x] A `.ts` file with only the `NB ADR` line — expected: no warning. — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-requirements/24528e4e-551f-43a1-afe2-750004f4ef3e/scratchpad/only.ts: no output, exit 0.

## Adversarial review

- [x] Claim 1: the padding is the only reason the count exceeded the cap — attack: search for other callers of `chooseBinMs` or other bin producers; result: held — one production caller pair in `timeline-service.ts` with identical first and last times; `BIN_LADDER_MS` otherwise only validates `?binMs=`; the `MAX_BINS + 2` tolerance in `timeline-routes.test.ts` was tightened to `MAX_BINS`
- [x] Claim 2: no ladder pair in the existing test changes step after budgeting three extra bins — attack: compute each pair by hand; result: held — reviewer and tester computed all seven pairs; none sits within three bins of a boundary
- [x] Claim 3: the `NB` sentences state the ADR's rule and nothing else — attack: read each against its ADR; result: refuted three times by the reviewer (identity denominator, "only Refresh reports busy", "nonce derived from the secret"), plus an imprecise 0011 line; all four rewritten, ADR 0015 and 0017 corrected, and `resolve` now refuses tokens from another secret (the reviewer found ADR 0017 promised a property the code lacked); re-verified against the ADRs after the rewrite

## Edge cases found during execution (review)

- [x] A token issued under another secret, resolved before any `links()` read — expected: `null`; evidence: `share-links-routes.test.ts::a token issued under another secret stops resolving before any read reissues it`, red without the `isIssuedBySecret` check in `resolve` (`expected { documentId, role } to be null`), green with it.
- [x] Exactly half of a new topic's blocks came from an earlier topic — expected: the id is kept; evidence: `topic-assignment.test.ts::exactly half of the blocks from an earlier topic keeps its id`.

## Coverage honesty

- The 16 ms render budget behind `MAX_BINS` is the spec's measurement, not re-measured here.
- The hook is checked by hand, not by an automated test; it is a warning, never a gate.

## Edge cases found during execution

- `apps/server/src/history/timeline-routes.test.ts:162` still asserts `bins.length <= MAX_BINS + 2`. Observed: green, but the slack hides exactly the overshoot this fix removes, so a regression of the server path would not fail it. Outcome: not a defect, a weak assertion; developer to tighten to `MAX_BINS`.
- Callers of the bin functions: only `timeline-service.ts` (lines 97 and 111) and `timeline-query.ts` (ladder validation). No other bin producer exists. Outcome: nothing else can exceed the cap except the documented `?binMs=` pin.
- Hook: warns once per file (the `head -1`), so a file with several stray comments reports one. Outcome: as designed.
