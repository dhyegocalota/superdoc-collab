# Tester briefing: refinement-tests

Branch `chore/refinement-tests`, worktree `superdoc-take-home-wt-tests`, based on the structure lane. Nothing pushed.

## Commits

| Hash | Message |
|---|---|
| 59ad9b5 | test(types,history): fold the path tests into one table and delete the unused windows and single flight |
| 12c4707 | test(server): fold service and library copies into their route twins and drop the repository prose pins |
| 2ebdbd6 | test(web): assert band fading through data-faded instead of a class (red test, committed alone) |
| a1acca3 | test(web): fold duplicate cases and assert through attributes instead of class strings (adds `data-faded`) |
| 2750e0f | test(e2e): fold duplicate walks and stop waiting the real summary cooldown |

## Counts

| Package | Before | After | Note |
|---|---|---|---|
| libs/types | 13 | 7 | measured before and after |
| libs/history | 80 | 72 | measured before and after |
| apps/server | 383 + 2 skipped (plan) | 336 + 2 skipped | before not measured here; after measured with Docker Compose available |
| apps/web | 218 measured (plan said 214) | 205 | exactly the 13 planned removals |
| E2E | 48 | 38 | `playwright test --list` before and after |

## Deviations from the plan

- **Web baseline is 218, not 214.** The plan expected 201 after; 205 is the correct result of removing the 13 named tests. The four extra tests exist at the base commit and are untouched.
- **Server before count not measured.** The first baseline run was lost in the machine-wide heavy-command queue; the after count (336 passed, 2 skipped) matches the plan exactly.
- **E2E durations not recorded per walk.** The lead asked for the line reporter; it prints no per-test time. Whole run of the three specs twice: 38 passed in 6.5 minutes, no retries, so no merged walk came near the 120 s timeout.
- **T1 mutation** changed line 64 (`TimelineQueryParam.Topic`) to `'topics'` instead of `TimelineSearchParam.Topic`; typecheck failed in `timeline.test.ts` on `toExtend` either way.
- **Plan files** (`docs/features/refinement-tests/*`) are untracked in this worktree, so no plan box was ticked and this briefing is not committed.
- No fold had to be reverted. Every merge target covers the behaviour as the plan states.

## Mutation results

| Check | Result |
|---|---|
| T1.5 `'topic'` to `'topics'` in `timeline.ts` | `tsc` error TS2344 in `timeline.test.ts`; restored, clean |
| T2.8.1 delete `maxDebounce` line in `collaboration-server.ts` | "storing is forced..." fails: `expected 0 to be greater than 0` (poll timeout) |
| T2.8.2 delete the `configuration.timeout` line in the attach test | fails: `expected 10012 to be less than 3000`; close code assertion (4401) passed first |
| T2.8.3 delete `clearTimeout(timer.handle)` in `version-rooms.ts` | "stop leaves no timer behind..." fails: `expected 1 to be +0` |

All three product files restored with `git checkout`; the tree has no product change except `data-faded`.

## Hypotheses to attack

- Each fold in `test-plan.md` "Folds still guard" still goes red when its behaviour breaks. Highest risk: the in-flight refresh test (one model call), the cooldown-forgetting test (three cooldowns started by hand), and the topics no-LLM test (read first, then refresh, `scheduler.blocks` never called).
- The deleted timeline-api POST-with-`binMs` case is now covered only by the URL table through the GET path. If `requestSelectionSummary` builds its URL differently from `fetchSelectionSummary`, that case is unguarded. Check `timeline-api.ts`.
- The documents-routes delete test spies on `timelinePipelines.forget` after the story is written; confirm `forget` is called by the real delete route and not only by a runtime-document hook.
- The merged E2E "failed topics" walk asserts only the Ana author band (the deleted timeline walk asserted Ana and Bruno).
- Fake timers in the version-rooms rewrite are restored before any assertion; run the whole file in order, and the whole attach-collaboration file (the timeout is set per test server).

## How to run

```
pnpm typecheck && pnpm format:check
cd libs/types && npx vitest run
cd libs/history && npx vitest run
cd apps/server && npx vitest run
cd apps/web && npx vitest run
pnpm exec playwright test e2e/selection-summary.spec.ts e2e/time-travel.spec.ts e2e/timeline.spec.ts --repeat-each=2
```

## Gaps

- Full E2E suite not run (only the three changed specs).
- No sweep of `rg` for orphaned constants beyond typecheck; `noUnusedLocals` is off, so an unused constant would not fail.

## Follow-up from pre-flight review

- The topics no-LLM test now awaits `worker.idle()` after the read and after the refresh, so the refresh cannot answer AlreadyRunning and `scheduler.blocks` not being called is a real assertion.
- The collaboration-server typing interval is cleared with `onTestFinished`.
- Gap: with the class checks gone, nothing pins the Other band's distinct style (accepted by the spec).
