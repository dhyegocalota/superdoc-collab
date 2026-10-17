---
paths:
  - "apps/server/**"
  - "libs/history/**"
---

# History capture and projection

Citations to `poc/...` name files of the proof of concept removed on 2026-10-17; the facts stand, the evidence is summarized in ADR 0001–0004.

## Log schema
- `updates(sequence INTEGER PRIMARY KEY AUTOINCREMENT, document_name, connection_user_id, yjs_client_ids JSON text, server_time INTEGER ms, update_bytes BLOB)`, indexed on `(document_name, sequence)`. (poc/lib/update-log.ts, ADR 0001)
- `snapshots(document_name, sequence, state BLOB)`, primary key `(document_name, sequence)`. (poc/lib/update-log.ts)
- `client_identities(document_name, yjs_client_id, user_id, source)`, primary key `(document_name, yjs_client_id)`. (poc/lib/update-log.ts, ADR 0002)
- SQLite runs with `journal_mode = WAL` and `synchronous = NORMAL`. (poc/lib/update-log.ts)
- `yjs_client_ids` is the sorted, deduplicated set of struct clientIds decoded from the update with `Y.decodeUpdate`. (poc/lib/update-log.ts)
- Hocuspocus `onChange` is serialized per document and appends every update, except those whose transaction origin is `update-log-replay`. (poc/server/collaboration-server.ts)

## Identity tiers
- `Observed`: first socket that carried a struct from the clientId, `INSERT OR IGNORE`. (poc/lib/update-log.ts, ADR 0002)
- `Declared`: awareness `userId` equals the authenticated socket user, read from `document.connections[*].clients`. It overrides `Observed` only, never another `Declared`. (poc/server/collaboration-server.ts, poc/lib/update-log.ts, ADR 0002)
- `resolveAuthorIds` maps struct clientIds to users, returns them deduplicated and sorted, and throws when a clientId has no identity. (poc/lib/edit-events.ts)
- An update with no structs (deletion-only) is attributed to the sending connection's user. (poc/lib/edit-events.ts, ADR 0002)

## Projection
- `projectEditEvents` applies the baseline merged, then each update in order, diffs block states before and after, and emits `EditEvent{sequence, serverTime, authorIds, blockId, kind, inserted, deleted}`. (poc/lib/edit-events.ts)
- `BlockChangeKind` is `created | removed | modified | merged`. (poc/lib/edit-events.ts)
- A block's text change is diffed with `diffChars`; `inserted` joins added parts, `deleted` joins removed parts. (poc/lib/edit-events.ts)
- A merge emits a `merged` event with empty `inserted` and `deleted`, followed by a text change if the text also changed. (poc/lib/edit-events.ts)
- Projection costs 0.13-0.17 ms per update. (poc/RESULTS.md, ADR 0001)

## Bootstrap detection
- The baseline is every update up to the first one after which `meta.bootstrapState === 'committed'`; events are projected only from later updates. (poc/lib/document-history.ts)
- A log in which the bootstrap never committed throws. (poc/lib/document-history.ts)

## Reading the document
- `readMainStoryBlocks` reads `content[<key ending in ::story::main:word_document.xml>]`, takes `blocks[]`, keeps blocks whose `text` is a string, and sorts by the fractional `order[blockId]`. (poc/lib/document-content.ts)
- A missing main story yields no blocks. (poc/lib/document-content.ts)
- `mergedIntoBlockId` is a tombstone: the merged block keeps its text and gains `mergedIntoBlockId`; a split is stored as `splitFromBlockId` on the new block. (poc/lib/document-content.ts, poc/RESULTS.md)
- The projector reads only the main story's paragraph text. (poc/RESULTS.md)

## Windows
- `groupIntoWindows` cuts a new window when the gap since the window's end exceeds `idleGapMs`, or the event is more than `maxWindowMs` after the window's start, or the event brings a new author and the gap exceeds `coEditGapMs`. (poc/lib/edit-windows.ts)
- A window is `coEdited` when more than one author appears in it. (poc/lib/edit-windows.ts)
- Windows are deterministic: re-projecting from a reopened database yields identical events and windows. (poc/RESULTS.md, ADR 0001)

## Snapshots and materialize
- `compact` writes a snapshot at every `everyUpdates`-th update of a document that lacks one, with `INSERT OR IGNORE`; the server calls it from `onStoreDocument` with 1000. (poc/lib/update-log.ts, poc/server/collaboration-server.ts)
- `materialize` applies the latest snapshot at or before `untilSequence`, then the merged tail after it. (poc/lib/update-log.ts)
- Snapshot + tail equals a full replay at every sequence. (poc/RESULTS.md)
- `onLoadDocument` restores the room with `materialize` and applies it with origin `update-log-replay`. (poc/server/collaboration-server.ts)
- Time travel will use native Yjs snapshots; the design is proposed, not proven. (ADR 0003)

## SingleFlight
- Concurrent calls with the same key share one computation; a settled value is cached by key. (poc/lib/single-flight.ts)
- Failures are never cached: the in-flight entry is removed in `finally` and only resolved values reach `settled`. (poc/lib/single-flight.ts)

## Performance (T11: 204 paragraphs, 4 authors, 400 characters each)
- 9,619 updates, 6.0 per keystroke; log 4.6 MB, 2.9 KB per keystroke; update size p50 104 B, p95 1.7 KB. (poc/RESULTS.md)
- SuperDoc's own room state is 4.45 MB; the log adds about 3%. (poc/RESULTS.md, ADR 0001)
- Full replay about 900 ms; snapshot + tail replay about 95 ms; append about 33k updates/s. (poc/RESULTS.md)
- Yjs decode (98 ms) dominates a roughly 100 ms load; the SQLite read is 13 ms. (ADR 0003)
