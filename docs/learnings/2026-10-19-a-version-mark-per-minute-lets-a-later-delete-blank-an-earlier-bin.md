# A version resolved to a mark shows edits that came later in the same minute
- Date: 2026-10-19
- Inspired by: [version view after a delete](../features/version-view-after-delete/spec.md), [ADR 0003](../adr/0003-time-travel-with-native-yjs-snapshots.md), [ADR 0043](../adr/0043-a-known-version-sequence-resolves-exactly-and-marks-anchor-the-timeline.md)
- Revisited: 2026-10-19 — still true

## Signal

Add a paragraph, edit it, delete it, then open the version of the edit: the document is blank. The snapshot, the replay and the export all behave; every `/versions/<sequence>/text` for sequences inside the minute answers the post-delete text.

## Cause

A version mark is the last update of each minute, and the server resolved every sequence to a mark. The edit sat in the same minute as the delete, so its version was the post-delete state. Tombstones and a snapshot taken after the delete were not the cause: the delete is a `merged` event and the restored document equals the mark exactly. Narrowing the mark window to the narrowest bin did not help either, because the owner's three edits fall in one bin.

## Do

When a version looks wrong, list the marks and the events with their `serverTime` first; the resolution boundary explains it before the replay does. Serve a sequence the log knows from the log, and keep marks for anchoring the timeline. An E2E that follows a fast owner must not wait for bin boundaries: the edit list row opens the version of its own sequence.

## Anchor

`libs/history/src/version-state.ts` (`versionAt`), `libs/history/src/version-marks.ts` (`resolveMark`), `libs/history/src/version-state.test.ts` (the version at the sequence of an edit), `e2e/time-travel.spec.ts` (the version of an edit shows the paragraph after it was deleted later)
