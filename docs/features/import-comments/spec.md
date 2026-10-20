# Import comments from an uploaded DOCX

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-20
**ADRs:** [0024](../../adr/0024-times-follow-the-readers-zone-storage-stays-epoch.md)
**Not changing:** live comments made in the editor after upload, tracked-change import, time travel, the update log.

## Problem

An uploaded DOCX keeps its tracked changes on the timeline with their original authors and dates, but its comments are dropped: the history of a reviewed document loses every reviewer who only commented. The email of 2026-10-14 promised both.

## Goals

- Every comment and reply in an uploaded DOCX becomes one imported event on the timeline, signed by its original author at its original date, on the block it is anchored to.
- A comment counts as activity of its author in the band, the contributors and the bin it falls in.
- The bin's edit list shows a comment as a comment, not as inserted text.

## Non-goals

- Comments added in the editor after the upload.
- Resolution state, threads as a tree, comments outside the main story.

## Design

### Data flow

The projection worker opens the stored DOCX once with the SDK and lists tracked changes (as today) and comments (`comments.list`). `toImportedComments` maps each comment that is not a tracked-change card to an `ImportedRevision` with kind `commented`, author `creatorName`, time `createdTime`, block from `target.segments[0].blockId` (a reply takes its parent's block) and the comment text as its text. `commitImported` stores both lists in the same transaction, keyed `imported:comment:<id>` so a comment never collides with a tracked change id.

### Interfaces

- `BlockChangeKind.Commented` (`libs/types`).
- `ImportedRevision.kind`.
- `TimelineEvent.commented`, `EditRun.commented`, `EditRunView.commented`: runs of comments never merge with edit runs.

### Failure handling

A comment with no author, date, text or reachable block throws `IncompleteCommentError`; the import fails the same way an unreadable tracked change does, and the document still opens.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Ship it today, lean | Implement / declare as a limit | Implement now, fastest path | 2026-10-20 |

## Test strategy summary

Unit tests for the mapping and the run grouping; one server integration test that uploads a DOCX with a tracked change and a comment and reads both back as imported events; the existing E2E suite through the local gate.
