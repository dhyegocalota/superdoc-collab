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

Fix: a mark per `VERSION_MARK_MS` that equals the narrowest bin, so a bin end always has a mark of its own. Edits and a delete inside one bin still show the bin's end state, which is the document as it was at the bin's last instant.

## Change

- `libs/types`: `NARROWEST_BIN_MS` (10 seconds) and `VERSION_MARK_MS = NARROWEST_BIN_MS`.
- `libs/history`: the narrowest step of the bin ladder is `NARROWEST_BIN_MS`; the mark and resolution code is untouched.
- ADR 0003 addendum and the history rules state the new window.

## Failure handling

The lane ships nothing until the cause is written down with evidence; a fix at a symptom (hiding the version link) is out.

## Test strategy summary

Unit at the failing layer (`libs/history` or `apps/server/src/history`) reproducing the sequence of updates; E2E `e2e/time-travel.spec.ts` with the five steps.
