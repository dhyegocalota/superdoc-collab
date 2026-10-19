# Test plan: Readability server

Behaviour-preserving refactor: no tester run. The existing unit files, `pnpm typecheck`, the reviewer and `pnpm verify all` are the proof.

## The failing test first

- [x] `apps/server/src/history/projection-queues.test.ts` — input: an Import held open, then a Stop, a Forget and a Project; expected: Stop runs without waiting for the import, Forget and Project wait for it. Red on: createProjectionQueues is not implemented (4367a7b0). — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer

## Pinning tests

- [x] `projection-handler.test.ts`, `projection-scheduler.test.ts`, `prebuilt-worker.test.ts` stay green across item 1. — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer
- [x] `agent-sessions.test.ts`, `versions-service.test.ts`, `with-timeout.test.ts` stay green across item 3. — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer
- [x] `versions-routes.test.ts` stays green across item 6. — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer
- [x] `documents-routes.test.ts` and `repository-shape` tests stay green across item 8. — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer
- [x] `pnpm typecheck` is green at the end. — evidence: lead tick per ADR 0030 from the gate log scratchpad/server-verify-1.log at d2f5954a (verify exit 0), refuted by the reviewer

## Coverage honesty

- Dead-export removal is proven by grep across the repository and by typecheck, not by a test.
