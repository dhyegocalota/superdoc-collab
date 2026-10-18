# Readability server

**Status:** Approved
**Lane:** product
**Tier:** 🟢 small. A behaviour-preserving refactor of `apps/server/src`, with no schema, route or wire change.
**Owner approval:** approved 2026-10-18
**ADRs:** none new.
**Not changing:** HTTP routes, status codes, response bodies, `Retry-After` values, SQLite schemas, the worker message protocol, `apps/server/src/collaboration/**` (another lane), the blank-string comparison in `insights/topics-service.ts` (the libs lane swaps it) and `libs/types/src/constants.ts`.

## Problem

The survey of `origin/main` (`ba25379d`) found server code a first-time reader has to decode: an if-chain over projection request kinds in two places, user-visible messages inline in two files, promises named like plain values, a magic `1000` and a local seconds constant beside the shared one, a test helper copied byte for byte, a header value repeated four times, exports nothing imports, and two functions over 100 lines.

## Goals

Each item is one commit, pinned by the existing unit tests of the files it touches, with a new test first where behaviour could drift.

1. **Projection dispatch by record.** `projection-handler.ts` `handle` and the message listener in `projection-worker.ts` dispatch from a record keyed by `ProjectionRequestKind`. The queue choice stays exact: Stop and Project and Version and Blocks join the serial queue, Import joins the import queue, Forget waits for both. A test pins the order of replies for a Stop after an Import.
2. **Inline messages become constants.** The two `AgentToolError` messages in `agent/agent-sessions.ts` and the client-metadata message in `auth/registration-limits.ts` become named constants at the top of their file, the server pattern (`IMPORT_FAILED_MESSAGE` in `projection-messages.ts`).
3. **Promise names.** `queue`, `importQueue`, `stopping`, `work`, `expired`, `started` and `turn` carry a `Promise` suffix.
4. **Shared time constants.** `testing/oauth-client.ts` and `testing/timeline-client.ts` import `SECOND_MS` from `libs/types`.
5. **One `temporaryDirectory`.** The copy in `database/migrate.test.ts` and `database/connection.test.ts` moves to `apps/server/src/testing`.
6. **One retry helper in `versions-routes.ts`** for the four repeated `retryAfterSeconds: RETRY_AFTER_SECONDS` replies.
7. **Dead exports.** Only exports with no importer anywhere in the repository, tests included, lose `export`.
8. **Long functions.** `createServices` in `server.ts` and `createDocumentsRoutes` in `documents-routes.ts` split into named parts by concern, with the same wiring.
9. **Sweep.** Nested ifs, `else`, loops, positional multi-parameter functions, unnamed compound conditions, `??` fallbacks and functions over 40 lines: clear cases fixed, the rest listed under Known gaps.

## Non-goals

- Any web, `libs/` or `collaboration/` change.
- New behaviour, new routes, or renamed public symbols other than the ones above.

## Test strategy summary

Existing unit files for every touched module run green after each commit. Item 1 adds a test first. `pnpm typecheck` runs once at the end. `pnpm verify all` and the reviewer are the proof, as for any behaviour-preserving refactor.

## Known gaps

Filled in when the sweep (item 9) ends.
