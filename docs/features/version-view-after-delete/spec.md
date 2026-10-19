# Version view after a delete

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's repro: new document, add a paragraph, edit it, delete it, open the edit's version from the timeline → the document shows blank)
**ADRs:** [0003](../../adr/0003-time-travel.md), pruned-version-resolves-to-its-minute
**Not changing:** the timeline, the version route shape, the version viewer's frame

## Problem

1. New document. 2. Add a paragraph. 3. Edit it right away. 4. Delete it. 5. Open the edit's version from the timeline. Expected: the document as it was after the edit. Seen: a blank document.

## Goals

1. Root cause found with `systematic-debugging` and recorded here before the fix: reproduce in the local stack with an E2E that follows the five steps and asserts the version text; add instrumentation at each boundary (sequence chosen by the timeline → version state materialised on the server → DOCX handed to the frame → text painted) to see where the paragraph disappears.
2. The version opened for an edit event shows the paragraph with its edited text.
3. A regression test at the layer that was wrong, plus the E2E.

## Hypotheses to check (not conclusions)

- The version resolves to a minute or sequence after the delete (the pruned-version rule rounds to its minute; the three edits happen within one minute).
- The version state is built from a snapshot taken after the delete and `Y.createDocFromSnapshot` cannot restore deleted content; `version-state.ts` already uses `gc: false`, so check which document is snapshotted and when.
- The version DOCX export drops a paragraph that exists only as deleted structs.

## Root cause

Evidence, from a throwaway E2E on the local stack (add a paragraph, edit it, delete it with Backspace, all within one second) and from a unit replay of the same three updates:

| Boundary | What crossed it |
|----------|-----------------|
| Edit events | sequences 25 (created), 32 (modified, inserted), 38 (modified, deleted), 44 (merged); all `serverTime` within 252 ms |
| `GET /versions?around=` | two marks only: 22 (bootstrap) and 49 (the last update of the minute) |
| Timeline bin | one bin of 10 000 ms with `versionSequence` 49 |
| `GET /versions/<sequence>/text` for 25, 32, 38 and 44 | every one resolves to mark 49 and answers the text without the added paragraph |
| Unit replay (bootstrap, add, edit, delete five seconds apart) | sequences 3 and 4 resolve to mark 5, whose text is empty |

Cause: `endsItsMinute` keeps one mark per minute, the last update of that minute, and `versionSequenceAt` maps a bin's last instant to that mark. The bin is as narrow as 10 seconds (`BIN_LADDER_MS`), so the version of a bin that ends before the delete still carries every edit made later in the same minute. Nothing is lost in the snapshot, the GC-free replay or the export: `Y.createDocFromSnapshot` over the mark restores exactly what it was given, and the mark is the post-delete state. The hypotheses about a tombstone and a snapshot taken after the delete are refuted; the delete is a `merged` event whose text the version already omits, and the replay is gc-free.

The first fix attempt, a mark per narrowest bin, was dropped: the owner adds, edits and deletes within one bin, and a bin shows its last instant, so the edit still opened blank. The owner's expectation is the document right after the edit. That needs the version at the edit's own sequence, which no mark granularity short of one per update gives.

## Change

- `libs/history`: `GcFreeReplays.versionAt` merges the log up to a sequence into a Yjs snapshot and restores it over the gc-free replay; `resolveMark` returns the sequence itself when the log knows it and clamps only an unknown one; a run carries `versionSequence`, the sequence of its last inserting event.
- `apps/server`: the worker builds a version at the resolved sequence; the bin edits answer `versionSequence` per run; a timeline bin's `versionSequence` is the sequence of its last event at or before its last instant (`lastEventSequenceAt`), not a mark.
- `apps/web`: the edit row has a View version after this edit button that pins `?at=<bin>&sequence=<n>`; the version pin honours an explicit sequence; selecting a bin or Back to live drops it.
- [ADR 0043](../../adr/0043-a-known-version-sequence-resolves-exactly-and-marks-anchor-the-timeline.md) supersedes the resolution rule of ADR 0027 and keeps its clamp for unknown sequences. Marks stay one per minute.

## Cost and bounds

| Measure | Value |
|---------|-------|
| Version build, 12 802 updates (262 KB log, 60 paragraphs of 540 characters, synthetic worst case), cold replay, mid sequence | 197 ms |
| Same log, the last sequence, cold and warm replay | 663 ms and 677 ms |
| Same log, a sequence near the start | 31 ms cold, 1 ms warm |
| Version cache | an `LruMap` by exact sequence, 16 entries and 256 MiB (`VERSION_CACHE_SIZE`, `VERSION_CACHE_MAX_BYTES`) |
| Version rooms | an `LruMap` by exact sequence, 32 rooms (`VERSION_ROOMS_LIMIT`), idle after a minute |
| Replay cache in the worker | 2 gc-free documents; a version adds one temporary merged update |
| Builds per user | 30 in a rolling minute (`VERSION_LOADS_PER_MINUTE`), counted only for a build that is not cached, in flight or failed; 429 with `Retry-After` above it |
| Pending version jobs | 8 (`MAX_PENDING_VERSION_JOBS`); the next distinct request is refused with 503 and `Retry-After`, never queued |

Both limits come from [ADR 0044](../../adr/0044-version-builds-are-budgeted-per-user-and-capped-in-the-projection-queue.md): exact resolution makes every sequence a cache miss, so one reader could otherwise keep the serial projection queue busy for every document.

The 4-page fixture was not measured on its own: a DOCX import is a handful of updates, so its build time sits at the cheap end of this table. The cost is the merge of the log up to the sequence, not the replay, which the cache already keeps current.

Tests: the unit test replays add, edit, delete two seconds apart and asks for the version at the edit; every logged sequence restores exactly as a full replay; the E2E follows the owner's five steps with no waiting.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where does the version after an edit open from, and what does a bin open? | the edit row of a bin, with a button; separate rows per event | the lead approved: one row per run keeps its shape and gets a View version button for the last inserting event (a run of only deletions carries its last event), pinned through `?sequence=` beside `at`; a bin opens the exact sequence of its last event, and `?at=` links already shared keep working | 2026-10-19 |

## Failure handling

The lane ships nothing until the cause is written down with evidence; a fix at a symptom (hiding the version link) is out.

## Test strategy summary

Unit at the failing layer (`libs/history` or `apps/server/src/history`) reproducing the sequence of updates; E2E `e2e/time-travel.spec.ts` with the five steps.
