# Tester briefing: Version view after a delete

## What changed

- `libs/history/src/version-state.ts` — `versionAt` restores any logged sequence from the merged log.
- `libs/history/src/version-marks.ts` — `resolveMark` returns a known sequence itself and clamps only an unknown one.
- `libs/history/src/timeline/runs.ts` and `apps/server/src/history/timeline-service.ts` — a run carries `versionSequence`.
- `apps/web/src/features/timeline/` — the edit row button, the `sequence` search parameter, the version pin and the travel hooks.
- ADR 0043 supersedes the resolution rule of ADR 0027; the history rules and a learning record it.

## How to run

```bash
pnpm --filter @superdoc-collab/history exec vitest run
pnpm --filter @superdoc-collab/server exec vitest run src/history
pnpm --filter @superdoc-collab/web exec vitest run src/features/versions src/features/timeline
pnpm test:e2e e2e/time-travel.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `version-state.test.ts::the version at the sequence of an edit shows the edit…` | stub threw `versionAt is not implemented` (aa563692) | the log merged up to the edit is restored |
| `version-marks.test.ts::a sequence the log knows resolves to itself…` | the pruned sequence resolved to its minute's mark | known sequences resolve to themselves |
| `versions-routes.test.ts::a logged sequence that is not a mark resolves to itself` | resolved to the newest mark | resolves to itself |
| `runs.test.ts::a run opens the version after its last inserting event…` | `versionSequence` was the last event, the delete (7e8dacd5) | last inserting event |
| `bins.test.ts::the version of a bin is the last event at or before its last instant…` | stub threw `lastEventSequenceAt is not implemented` | exact last event |
| `timeline-routes.test.ts::a bin opens the sequence of its own last event, not the mark of its minute` | pin (the fix landed in 8cc6f830; with no marks the old code answered null) | each filled bin answers its own last event |
| `e2e/time-travel.spec.ts::selecting the bin of an edit shows the edited paragraph when the delete is in the next bin` | mutation: with the bin sequence taken from the minute mark it received the seed text without the paragraph | the bin shows `Added line edited` |
| `time-travel.test.tsx::an edit row opens the version after that edit` | no button on the edit row | button pins `sequence` |
| `e2e/time-travel.spec.ts::the version of an edit shows the paragraph after it was deleted later` | no edit row button | edit row opens the edited paragraph |

## Hypotheses to attack

1. Hypothesis: the owner's five steps, typed fast, open the edited paragraph from the edit row. Break it by: doing them by hand, then opening the add and delete rows of other blocks.
2. Hypothesis: a bin click still opens the bin's mark and clears `sequence`. Break it by: clicking the edit row, then another bin, then Back to live and the browser Back button.
3. Hypothesis: a shared link with `at` and `sequence` opens the same version for another member. Break it by: opening it as a reader.
4. Hypothesis: an unknown sequence in the URL clamps like before. Break it by: `?sequence=999999`.
5. Hypothesis: scrubbing exact versions stays inside the cache bounds. Break it by: opening more than sixteen edit rows in turn.

## Known gaps

- A bin click shows the exact state at the bin's last event. A delete in the same bin still blanks the bin version; a delete in the next bin does not. The edit row shows the document after its own edit in either case.
- The new bin E2E waits up to about 30 s of wall clock to keep the edits and the delete in one minute.
- A run groups an author's edits of one block in one bin, so one row opens the version after the last inserting edit, not after every edit.
- The build time was measured on a synthetic 12 802-update log, not on the 4-page fixture.
- `sequence` is also a `TimelineQueryParam` only to satisfy the rule that every page parameter is a query parameter; no route reads it.
