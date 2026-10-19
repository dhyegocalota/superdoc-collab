# A forced collection inside Hocuspocus' unload hook frees nothing
- Date: 2026-10-19
- Inspired by: docs/features/memory-returns, the capped repro of the heavy document
- Revisited: 2026-10-19 — still true

## Signal
The log prints "Released the memory of a heavy room" but resident memory rises and the main heap stays near 680 MB for minutes after the last disconnect.

## Cause
`afterUnloadDocument` runs while Hocuspocus' own unload frame still holds the room's `Y.Doc`. A synchronous major collection called from the hook finds it reachable and keeps it. A heap snapshot taken later shows the heap at 55 MB, so nothing retained it after the frame ended.

## Do
Defer the collection to the next macrotask with `setImmediate`, then measure heapUsed, not only rss: macOS compresses idle pages and understates rss.

## Anchor
`apps/server/src/collaboration/room-memory-release.ts`, `room-memory-release.test.ts`, commit 67f3a4ac.
