# Test plan: Readability server

Behaviour-preserving refactor: no tester run. The existing unit files, `pnpm typecheck`, the reviewer and `pnpm verify all` are the proof.

## The failing test first

- [ ] `apps/server/src/history/projection-queues.test.ts` — input: an Import request then a Stop request; expected: the import reply is posted before the worker stops.

## Pinning tests

- [ ] `projection-handler.test.ts`, `projection-scheduler.test.ts`, `prebuilt-worker.test.ts` stay green across item 1.
- [ ] `agent-sessions.test.ts`, `versions-service.test.ts`, `with-timeout.test.ts` stay green across item 3.
- [ ] `versions-routes.test.ts` stays green across item 6.
- [ ] `documents-routes.test.ts` and `repository-shape` tests stay green across item 8.
- [ ] `pnpm typecheck` is green at the end.

## Coverage honesty

- Dead-export removal is proven by grep across the repository and by typecheck, not by a test.
