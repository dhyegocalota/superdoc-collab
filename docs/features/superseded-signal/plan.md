# Plan: The superseded creator's page learns of the takeover at once

**Spec:** spec.md
**Tier:** 🟢
**Seam:** the `SuperDoc` instance created in `apps/web/src/features/editor/superdoc-editor.tsx` and its `socket` (`HocuspocusProviderWebsocket`).
**Assumptions (decided, owner can override):**
- The listener is attached where SuperDoc first exposes `socket`; the developer reads the SuperDoc dist to find that moment and pins it in the unit test.
- A superseded close disconnects the socket itself; every other close is left to the provider.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/connection.ts`, `apps/web/src/features/editor/superseded-close.ts`, `superseded-close.test.ts`, `superdoc-editor.tsx`, `superdoc-editor.test.tsx`, `connection-copy.ts`, `connection-copy.test.ts`, `connection-banner.test.tsx`, `e2e/room-admission.spec.ts`, `docs/features/room-admission/spec.md`, `docs/features/connection-state/spec.md`, `docs/features/README.md` | `developer-ss` |

## Sequencing

One group.

## Steps

### G1

- [ ] **Step 1:** red unit test `superseded-close.test.ts` and the stub (`supersededReportOf is not implemented`); commit the red test alone.
- [ ] **Step 2:** `ConnectionFailureReason.Superseded`, `supersededReportOf`, the copy; unit green.
- [ ] **Step 3:** red test in `superdoc-editor.test.tsx` for the socket listener; then the listener in `SuperDocEditor` with disconnect and cleanup; green.
- [ ] **Step 4:** E2E bound: the holder-reopens proof waits `SUPERSEDED_SIGNAL_TIMEOUT_MS` for the banner or the notice and asserts the Superseded copy on the banner path.
- [ ] **Step 5:** docs: room-admission spec known limit removed, connection-state spec reason list, features README statuses; tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 3 | `socket` is set after the first close event and the listener misses it | the unit test that attaches before the mocked close fails; the E2E keeps taking 40 s | attach on construction and again on `onReady`, deduplicated by the socket identity |
| 3 | a server restart's 4403 (old epoch on a committed room) now shows the Superseded copy | the connection-state restart proof reads the wrong reason | the restart close carries the same reason by design (ADR 0033); the copy is reviewed to fit both |
| 4 | the E2E bound is too tight under five workers | the holder-reopens test fails on the 10 s wait while the second page is still loading | the bound starts after the second page's open request answered, and the gate log shows the measured delay |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the banner on the superseded tab and the video of the takeover.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
