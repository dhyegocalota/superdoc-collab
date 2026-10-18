# A second test stack reuses the first server's hooks and port
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md (finding 2); poc/tests/t4-chaos.spec.ts::T7
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-18 — still true

## Signal
After starting a second collaboration server in the same process, requests hit the first server's hooks and database, or the listen call collides with the first server's port. Restarting a server inside one test does not change behaviour.

## Cause
The `Server` exported by `@hocuspocus/server` is a module-level singleton instance. Configuring and listening on it again mutates shared state instead of creating an independent server.

## Do
Construct `new Hocuspocus({...})` for every server and call `listen()` on that instance. Never use the exported `Server`.

## Anchor
- `poc/server/collaboration-server.ts` — `startCollaborationServer` builds `new Hocuspocus({...})`
- `poc/tests/harness.ts` — `startStack` and `restartCollaboration`
- `poc/tests/t4-chaos.spec.ts` — `T7: server restarts mid-session`
