# A forced collection after a heavy room unloads frees nothing
- Date: 2026-10-19
- Inspired by: docs/features/memory-returns, the capped repro of the heavy document
- Revisited: 2026-10-19 — changed because the first cause was wrong; the unload was transient

## Signal
The log prints "Released the memory of a heavy room" but the main heap stays near 700 MB for minutes after the last disconnect, and a collection run by hand later frees it at once.

## Cause
Two things looked like the cause and were not: a synchronous collection inside the unload hook, and the flavor or the number of passes. On the capped repro the creator hand-off closes the bootstrap socket and opens the regular one, so the heavy room unloads for under a second and loads again. The collection ran against a live room, and it spent the cooldown meant for the real unload.

## Do
Collect a second after the unload, skip the collection when the room is in the server's map again, and spend the cooldown only on a collection that ran. Measure heapUsed around the call: macOS rss under load is not evidence.

## Anchor
`apps/server/src/collaboration/room-memory-release.ts`, `room-memory-release.test.ts`, commit 3e60df72.
