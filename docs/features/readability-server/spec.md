# Readability server

**Status:** Shipped 2026-10-18
**Lane:** product
**Tier:** 🟢 small. A behaviour-preserving refactor of `apps/server/src`, with no schema, route or wire change.
**Owner approval:** approved 2026-10-18
**ADRs:** none new.
**Not changing:** HTTP routes, status codes, response bodies, `Retry-After` values, SQLite schemas, the worker message protocol, `apps/server/src/collaboration/**` (another lane), the blank-string comparison in `insights/topics-service.ts` (the libs lane swaps it) and `libs/types/src/constants.ts`.

## Problem

The survey of `origin/main` (`ba25379d`) found server code a first-time reader has to decode: an if-chain over projection request kinds in two places, user-visible messages inline in two files, promises named like plain values, a magic `1000` and a local seconds constant beside the shared one, a test helper copied byte for byte, a header value repeated four times, exports nothing imports, and two functions over 100 lines.

## Goals

Each item is one commit, pinned by the existing unit tests of the files it touches, with a new test first where behaviour could drift.

1. **Projection dispatch by record.** `projection-handler.ts` `handle` and the message listener in `projection-worker.ts` dispatch from a record keyed by `ProjectionRequestKind`: five kinds in the handler, six in the queues. The queue choice stays exact: Project, Version, Blocks and Stop join the serial queue, Import joins the import queue, Forget waits for both. A test pins that a Stop does not wait for a pending Import.
2. **Inline messages become constants.** The two `AgentToolError` messages in `agent/agent-sessions.ts` and the client-metadata message in `auth/registration-limits.ts` become named constants at the top of their file, since the server has no copy files, the server pattern (`IMPORT_FAILED_MESSAGE` in `projection-messages.ts`).
3. **Promise names.** `queue`, `importQueue`, `stopping`, `expired`, `started`, `turn`, `turnEnded` and `tail` carry a `Promise` suffix. The `work` parameter of `withTimeout` is not renamed: its caller in `collaboration/version-rooms.ts` is outside this lane.
4. **Shared time constants.** `testing/oauth-client.ts` and `testing/timeline-client.ts` import `SECOND_MS` from `libs/types`.
5. **One `temporaryDirectory`.** The copy in `database/migrate.test.ts` and `database/connection.test.ts` moves to `apps/server/src/testing`.
6. **One retry helper in `versions-routes.ts`** for the four repeated `retryAfterSeconds: RETRY_AFTER_SECONDS` replies.
7. **Dead exports.** Only exports with no importer anywhere in the repository, tests included, lose `export`: 51 names.
8. **Long functions.** `createServices` in `server.ts` and `createDocumentsRoutes` in `documents-routes.ts` split into named parts by concern, with the same wiring.
9. **Sweep.** Nested ifs, `else`, loops, positional multi-parameter functions, unnamed compound conditions, `??` fallbacks and functions over 40 lines: clear cases fixed, the rest listed under Known gaps.

## Non-goals

- Any web, `libs/` or `collaboration/` change.
- New behaviour, new routes, or renamed public symbols other than the ones above.

## Test strategy summary

Existing unit files for every touched module run green after each commit. Item 1 adds a test first. `pnpm typecheck` runs once at the end. `pnpm verify all` and the reviewer are the proof, as for any behaviour-preserving refactor.

## Known gaps

- **Unknown request kind.** The record dispatch throws in the worker's message listener on a kind outside the enum, where the if-chain fell through to Project. Only the parent thread sends typed kinds, so it is unreachable from outside the process. The worker restarts within its budget.
- **Sweep result.** Outside `collaboration/**` there is no `else`, no `??`, no nested `if` and no positional multi-parameter function except the `WebSocket` constructor signature in `testing/collaboration-client.ts`. The two `while` loops (`agent/agent-sessions.ts` slot wait, `database/migrate.ts` directory walk) are stateful waits that an array method cannot express. `createVersionsRoutes` was split.
- **Functions still over 40 lines.** `createApp` in `http/app.ts` (61), `mountCreation` (53) and `mountOpening` (41) in `documents/documents-routes.ts`, and `createInsightsRoutes` (43). Each is a flat sequence of route or middleware registrations, and splitting them would only move lines.
- **`history/timeline-service.ts` at 355 lines.** It already holds small named functions around one pipeline. Splitting by file would separate functions that share the private pipeline types, so it stays.
- **`withTimeout` `work`.** Not renamed, see item 3.
