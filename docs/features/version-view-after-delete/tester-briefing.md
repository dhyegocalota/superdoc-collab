# Tester briefing: Version view after a delete

## What changed

- `libs/types/src/constants.ts` — `NARROWEST_BIN_MS` (10 seconds); `VERSION_MARK_MS` now equals it instead of a minute.
- `libs/history/src/timeline/bins.ts` — the narrowest ladder step is `NARROWEST_BIN_MS`.
- `libs/history/src/version-marks.test.ts` — fixtures scaled to the mark window.
- `libs/history/src/timeline/bins.test.ts` — every bin width is a whole multiple of the mark window.
- ADR 0003 addendum, `.claude/rules/history.md` and a learning record the new window.

## How to run

```bash
pnpm --filter @superdoc-collab/history exec vitest run
pnpm --filter @superdoc-collab/server exec vitest run src/history
pnpm test:e2e e2e/time-travel.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/history/src/version-state.test.ts::the version of a bin that ends before a later delete in the same minute shows the edit` | received `'Plan'` instead of `'PlanAdded and edited'`: the bin resolved to the post-delete mark (d3520ead) | the bin's end has its own mark |
| `e2e/time-travel.spec.ts::the version of an edit shows the paragraph after it was deleted later` | version text lacked `Added line edited` (mark window set back to a minute) | the edit's bin shows `Added line edited` |
| `libs/history/src/timeline/bins.test.ts::every bin width is a whole number of version mark windows…` | pin | guards the invariant that makes a bin end own a mark |

## Hypotheses to attack

1. Hypothesis: a bin that ends before a later delete shows the paragraph. Break it by: the owner's five steps with 10 seconds or more between steps.
2. Hypothesis: edits and a delete inside one 10-second bin still open blank, by design, because a bin shows its last instant. Break it by: running the five steps within a second and reading the add, edit and delete bins.
3. Hypothesis: older documents keep working. Break it by: opening a document whose marks were written per minute and scrubbing every bin.
4. Hypothesis: the pruned-version rule still holds at the new window. Break it by: pinning `?at=` of the live bin, typing, and reloading.

## Known gaps

- The names `minuteStart`, `minute_start` and `endsItsMinute` still say minute; renaming needs a read-model migration and was left out.
- Marks written before this change keep minute granularity, so old edits inside one minute still resolve to its last update.
- Mark storage grows up to six times for continuously edited minutes; no measurement was taken.
- The throwaway E2E found all keystrokes of a paragraph can arrive as one Yjs update, so a bin shows text only after the editor syncs it.
