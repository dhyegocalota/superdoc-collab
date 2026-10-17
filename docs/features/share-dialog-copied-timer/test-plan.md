# Test plan: Share dialog copied timer

Test-only fix: the lag repro, ten runs and the suite are the proof (HARNESS §5).

- [x] Lag repro, original test with 2.5 s of real lag after the second copy — expected: fails 5 of 5 (evidence: 5 of 5 failed)
- [x] Lag repro, fixed test with the same lag — expected: passes 5 of 5 (evidence: 5 of 5 passed)
- [x] `vitest run src/features/editor/share-dialog.test.tsx` ten times — expected: 12 passed each time (evidence: 10 of 10)
- [x] `vitest run` in `apps/web` — expected: 431 passed (evidence: 58 files, 431 tests)
- [x] `tsc --noEmit` in `apps/web` — expected: clean (evidence: no output)
