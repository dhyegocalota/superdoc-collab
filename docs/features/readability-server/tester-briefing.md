# Tester briefing: Readability server

**Lane:** `chore/readability-server`, behaviour-preserving. No tester runs it; the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## What changed

- Projection requests dispatch from records keyed by request kind in `history/projection-handler.ts` and `history/projection-queues.ts`.
- Server messages that were inline became file-top constants in `agent/agent-sessions.ts` and `auth/registration-limits.ts`.
- Seven promise names plus `turnEnded` and `tail` carry the `Promise` suffix.
- The testing clients use the shared `SECOND_MS`, and one `temporaryDirectory` lives under `testing/`.
- `history/versions-routes.ts` has one retry helper and one mount function per route, with a named options type exported from `http/retry-later.ts`.
- 51 exports nothing imported lost `export`.
- `createServices` and `createDocumentsRoutes` split into named parts.

## How to run

Targeted unit files one at a time through the server package's unit script: `history/projection-queues.test.ts`, `history/versions-routes.test.ts`, `agent/agent-sessions.test.ts`, then `pnpm typecheck` and the gate.

## Red then green

`history/projection-queues.test.ts` was a pin: it landed with a stub throwing `createProjectionQueues is not implemented`, and went green with the record dispatch (4367a7b0, fcd9dbb2). No other test was red.

## For the reviewer to refute

- A Stop does not wait for a pending Import, and a Forget waits for both queues.
- Every moved message is byte-identical to `main`.
- The Retry-After value and status of all four version replies are unchanged.
- Route registration order in documents and versions routes is unchanged.
- Service construction order in `server.ts` is unchanged, with one shared insights job runner.
- No un-exported name has an importer outside its file.

## Known gaps

See the spec's Known gaps: unknown request kind now throws in the worker listener, functions still over 40 lines, `timeline-service.ts` length, and `withTimeout`'s `work` outside the lane.
