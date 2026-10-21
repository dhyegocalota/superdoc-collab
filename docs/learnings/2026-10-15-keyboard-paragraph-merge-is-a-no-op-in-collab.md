# Backspace at a paragraph start and Delete at a paragraph end do nothing in collaboration mode
- Date: 2026-10-15
- Inspired by: the proof of concept's results (finding 5) and its E7 paragraph test
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
In a collaborative room, pressing Backspace at the start of a paragraph or Delete at its end leaves both paragraphs in place. No update reaches the server and no event is projected.

## Cause
The keyboard path for joining paragraphs is not wired in SuperDoc's collaborative setup. The document API merge works and records the merge as a tombstone on the merged block.

## Do
Merge with `doc.blocks.merge({ first, second })`. Expect the merged block to keep its text and gain `mergedIntoBlockId`, and model that in the projection as a `Merged` event, content-neutral, attributed to the acting author. A split is a new block with `splitFromBlockId`, projected as `Created`.

## Anchor
- `libs/history/src/edit-events.ts` — `BlockChangeKind.Merged` and `wasMerged`
- `libs/history/src/document-content.ts` — `mergedIntoBlockId` read from the block
