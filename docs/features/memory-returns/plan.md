# Plan: Memory returns

**Spec:** spec.md
**Tier:** 🔴
**Seam:** the projection scheduler and worker replies, the collaboration server's unload hook, the container entrypoint.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/documents.ts`, `apps/server/src/history/projection-scheduler*`, `apps/server/src/history/projection-worker.ts`, `apps/server/src/history/projection-messages.ts`, `apps/server/src/collaboration/room-memory-release*`, `docker/entrypoint.sh`, `tools/repository-shape/src/entrypoint.test.ts` | `developer` |
| G2 | `docs/features/memory-returns/*`, `docs/features/README.md`, `docs/learnings/*` | `developer` |

## Steps

- [ ] **Step 1:** the feature folder and its index row.
- [ ] **Step 2:** red test, then the constant, the heap in the reply and the recycle in the scheduler.
- [ ] **Step 3:** red test, then the room memory release and its call in the unload hook.
- [ ] **Step 4:** red test, then `--expose-gc` in the entrypoint.
- [ ] **Step 5:** the measurement on the capped repro, recorded in the test plan.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A recycle drops a request | a version or blocks request rejected after a heavy job | revert the scheduler change, crashes still respawn |
| 3 | The collection pauses the loop | the log line shows seconds | raise the constant |
| 4 | The flag is refused by the runtime | the server does not start | revert the entrypoint |

**Steps with no backout:** none
