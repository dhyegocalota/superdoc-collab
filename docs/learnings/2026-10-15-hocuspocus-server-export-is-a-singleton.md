# A second test stack reuses the first server's hooks and port
- Date: 2026-10-15
- Inspired by: the proof of concept's results (finding 2) and its T7 server-restart test
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-18 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
After starting a second collaboration server in the same process, requests hit the first server's hooks and database, or the listen call collides with the first server's port. Restarting a server inside one test does not change behaviour.

## Cause
The `Server` exported by `@hocuspocus/server` is a module-level singleton instance. Configuring and listening on it again mutates shared state instead of creating an independent server.

## Do
Construct `new Hocuspocus({...})` for every server and call `listen()` on that instance. Never use the exported `Server`.

## Anchor
- `apps/server/src/collaboration/collaboration-server.ts` — builds `new Hocuspocus({...})`
- `e2e/restartable-stack.ts` — a stack whose server stops and starts again inside one test
