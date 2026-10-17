# The SDK opens a document with a `collaboration` block, no error is raised, and the room on the server stays empty

- Date: 2026-10-17
- Inspired by: spike [`sdk-room-join`](../features/agentic-history-mcp/spike-sdk-room-join.md) (code at commit `c1ada06`) (agentic history, SuperDoc SDK inside a live Hocuspocus room); the docs page "Node.js SDK" shows the `collaboration` option without the runtime requirement, and the top-level `@superdoc/sdk` typings do not expose it, so the first search of the published package concluded it did not exist
- Revisited: 2026-10-17 — `room-join.test.ts` S1 to S4 green twice with `runtime: 'v2'`

## Signal
`client.open({ collaboration: { providerType: 'hocuspocus', url, documentId, roomMode } })` resolves, `doc.info()` and edits work, yet Hocuspocus never logs a connection, `server.documents` has no room, and a later `roomMode: 'join'` fails with `no committed v2 collaboration room exists for join intent`.

## Cause
Collaboration in the SDK host lives only in its v2 runtime (`src/lib/collaboration/v2-runtime.ts`). An open without `runtime: 'v2'` goes to the legacy engine, which accepts the `collaboration` field in `DocOpenParams` and ignores it, so the host edits a local in-memory session. The option is also typed only in `dist/generated/client.d.ts`, not in the package's top-level declarations, so a grep of `index.d.ts` misses it.

## Do
Pass `runtime: 'v2'` on every collaborative `open` (or `runtime: 'v2'` in `createSuperDocClient`), send the token through `collaborationAuth` per open, and assert in tests that the server saw a connection to `sd2/v2.1/<documentId>` before trusting any edit. When auditing a SuperDoc package for a feature, grep `dist/generated/` as well as `dist/index.d.ts`.

## Anchor
`spikes/sdk-room-join/room-join.test.ts` at `c1ada06` (`openRoom`), `docs/features/agentic-history-mcp/spike-sdk-room-join.md`
