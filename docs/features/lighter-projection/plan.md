# Plan: Lighter projection

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `GcFreeReplays` in the projection handler and `projectPending` in `libs/history`.
**Assumptions (decided, owner can override):**
- Removing the replay cache beats capping it at one document, because the measured step is faster without it.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/history/src/{projection,edit-events,version-state}.ts`, their tests, `apps/server/src/history/projection-{handler,worker}.ts` | `developer` |

## Steps

### G1

- [x] **Step 1:** red, `version-state.test.ts` builds versions with `versionAt` and reads the log no further than the sequence — cbb2f7e8
- [x] **Step 2:** red, `projection.test.ts` materializes once per run — 1b459f97
- [x] **Step 3:** `versionAt` from `materialize`, one document per run, replay cache removed — 4c478d7b
- [x] **Step 4:** measure before and after on the heavy log — spec.md table
- [ ] **Step 5:** docs, rule and ADR consequence — this change

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 3 | A version differs from a full replay | `version-state.test.ts` equality tests | revert 4c478d7b |
