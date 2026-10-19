# A bin's version shows the document after edits that came later in the same minute
- Date: 2026-10-19
- Inspired by: [version view after a delete](../features/version-view-after-delete/spec.md), [ADR 0003](../adr/0003-time-travel-with-native-yjs-snapshots.md)
- Revisited: 2026-10-19 — still true

## Signal

Add a paragraph, edit it, delete it, then open the bin of the edit: the version is the document without the paragraph. The snapshot, the replay and the export all behave; every `/versions/<sequence>/text` for sequences inside the minute answers the post-delete text.

## Cause

A version mark was the last update of each minute, while the timeline offers bins of 10 seconds. A bin that ends before a delete in the same minute resolves to the minute's mark, which already holds the delete. The hypotheses about tombstones and a snapshot taken after the delete were wrong: the delete is a `merged` event and the restored document equals the mark exactly.

## Do

Keep the mark window no wider than the narrowest bin and every bin width a multiple of it, so a bin end owns a mark. When a version looks wrong, list the marks and the events with their `serverTime` first; the resolution boundary explains it before the replay does. An E2E that spaces edits across bins must wait for the next bin start, not for any bin start, or all edits land in one bin.

## Anchor

`libs/types/src/constants.ts` (`NARROWEST_BIN_MS`, `VERSION_MARK_MS`), `libs/history/src/version-state.test.ts` (the version of a bin that ends before a later delete), `libs/history/src/timeline/bins.test.ts`, `e2e/time-travel.spec.ts` (the version of an edit shows the paragraph after it was deleted later)
