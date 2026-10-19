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

## Failure handling

The lane ships nothing until the cause is written down with evidence; a fix at a symptom (hiding the version link) is out.

## Test strategy summary

Unit at the failing layer (`libs/history` or `apps/server/src/history`) reproducing the sequence of updates; E2E `e2e/time-travel.spec.ts` with the five steps.
