# Backspace at a paragraph start and Delete at a paragraph end do nothing in collaboration mode
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md (finding 5); poc/tests/e-edge-cases.spec.ts::E7
- Revisited: 2026-10-16 — still true

## Signal
In a collaborative room, pressing Backspace at the start of a paragraph or Delete at its end leaves both paragraphs in place. No update reaches the server and no event is projected.

## Cause
The keyboard path for joining paragraphs is not wired in SuperDoc's collaborative setup. The document API merge works and records the merge as a tombstone on the merged block.

## Do
Merge with `doc.blocks.merge({ first, second })`. Expect the merged block to keep its text and gain `mergedIntoBlockId`, and model that in the projection as a `Merged` event, content-neutral, attributed to the acting author. A split is a new block with `splitFromBlockId`, projected as `Created`.

## Anchor
- `poc/tests/e-edge-cases.spec.ts` — `E7: new paragraphs and paragraph merges are attributed to the acting author`
- `poc/lib/edit-events.ts` — `BlockChangeKind.Merged` and `wasMerged`
- `poc/lib/document-content.ts` — `mergedIntoBlockId` read from the block
