# Plan: A pruned version sequence resolves to its minute

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `VersionsService.resolve` in `apps/server/src/history/versions-service.ts`; `clampToMark` in `libs/history/src/version-marks.ts`.
**Assumptions (decided, owner can override):**
- Resolution lives on the server (ADR 0026); the client pin and the E2E spec stay as they are.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/history/src/version-marks.ts`, `version-marks.test.ts`, `update-log.ts`, `apps/server/src/history/versions-service.ts`, `versions-routes.test.ts`, `apps/server/src/server.ts` | lead, inline |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red `resolveMark` tests with a not-implemented stub (2950b9e).
- [x] **Step 2:** `resolveMark`, `UpdateLog.serverTimeOf`, the service wired to the log, the route property test against `resolveMark`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a sequence past the newest mark resolves to that minute's mark that does not exist yet | `resolveMark` returns null → the route answers 409 Conflict where it answered the last mark | `versionSequenceAt` falls back to the latest earlier minute, so the newest mark is returned; the property test samples sequences up to the last mark |
| 2 | the log read per resolution adds latency | the versions route timing in the E2E | one point read by primary key |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** not applicable (no visual change; the version shown differs only in the race).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
