# Tester briefing: Server bootstrap

Written by the developer. Every "it works" below is a hypothesis for the tester to refute.

## What changed

- `apps/server/src/collaboration/room-bootstrap.ts` — the registry: stages, one job at a time, attempts, ready on commit.
- `apps/server/src/history/projection-{messages,handler,queues,scheduler,worker}.ts` — the `Bootstrap` request, its own queue, the SDK client with a long request timeout, a scheduler promise that rejects when the worker dies.
- `apps/server/src/agent/room-tokens.ts` — bootstrap tokens (actor Human, an attempt); agent tokens unchanged.
- `apps/server/src/collaboration/{authenticate-bootstrap,collaboration-server,attach-collaboration,upgrade-path,collaboration-runtime,bootstrap-state}.ts` — the loopback bootstrap path, admission as the owner, the attempt fence, the commit hook.
- `apps/server/src/documents/{documents-routes,store-document,documents-repository}.ts` — the open answer carries `bootstrap`; uploads, blank creates and the showcase start a bootstrap; `ownerOf`.
- Removed: `creator-reservations`, `claimed-ticket`, the reserve and takeover paths, the epoch, `isAttemptSuperseded` and `isAttemptRestarted`, the ticket constants and `CreatorTicket` from `libs/types`.
- `e2e/room-admission.spec.ts` rewritten; `e2e/fixtures/large-docx.ts` gains `buildBrokenDocx`.
- Docs: spec, plan, test plan, ADR 0048, a consequence line in ADR 0033, `.claude/rules/collaboration.md`, the room-admission spec note.

## How to run

```bash
pnpm exec playwright test e2e/room-admission.spec.ts
```

The web build fails on the removed exports until the web lane deletes its uses of the ticket. To run the spec before that merge, add the two `CREATOR_*_QUERY_KEY` exports back to `libs/types/src/routes.ts` for the run only.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|-------------------------------|---------------------|
| `projection-handler.test.ts` bootstrap tests | `handleBootstrap is not implemented` (423756c2) | the handler joins the room and times out (56aed11b) |
| `projection-queues.test.ts` pending bootstrap | the stub queued it behind a project (423756c2) | its own queue (56aed11b) |
| `projection-scheduler.test.ts` bootstrap tests | `bootstrap is not implemented` (423756c2) | a waiter resolved by the reply, rejected by a failure, a crash or a stop (56aed11b) |
| `room-tokens.test.ts` bootstrap tokens | `signBootstrapToken is not implemented` (282fa072) | claims carry the actor and an attempt (e3f3b7fc) |
| `room-bootstrap.test.ts` | `RoomBootstrap.request is not implemented` (950dd8de) | the registry (f108691b) |
| `bootstrap-state`, `upgrade-path`, `documents-repository` additions | red observed locally, committed together with the change (462881c0): a pin of nothing, not a red-first commit | the hook, the path test and `ownerOf` |
| `collaboration-server`, `collaboration-runtime`, `documents-routes`, `members-routes`, `attach-collaboration` | rewritten with the removal, committed together (2a458752) | not a red-first commit |

## Hypotheses to attack

- Only the bootstrap socket writes to an uncommitted room; a stale attempt cannot.
- A failed or lost bootstrap never leaves the open answer in Preparing.
- The first open of an old uncommitted document starts exactly one bootstrap.
- The heavy fixture: 38.9 s to Ready, 13.4 s from page open to the first paragraph, local, one run.
