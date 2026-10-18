# Plan: The superseded creator's page learns of the takeover within a poll

**Spec:** spec.md
**Tier:** 🟢
**Seam:** the members poll (`GET /api/documents/:id/members`) and `DocumentPage`.
**Assumptions (decided, owner can override):**
- The signal is the members poll carrying the creator ticket (ADR 0036); the bound is one poll interval.
- The banner action is Back to documents; Reload is not offered on a superseded tab.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/connection.ts`, `libs/types/src/documents.ts`, `apps/server/src/collaboration/claimed-ticket.ts`, `collaboration-runtime.ts`, `collaboration-server.ts`, `apps/server/src/documents/documents-routes.ts`, `documents-routes.test.ts`, `apps/web/src/features/editor/{editor-api,use-members,use-members.test,use-connection-state,connection-copy,connection-copy.test,connection-banner,connection-banner.test,document-page,document-page.test}.ts(x)`, `e2e/room-admission.spec.ts`, `docs/features/superseded-signal/*`, `docs/adr/0036-*.md`, `docs/adr/README.md`, `docs/features/room-admission/spec.md`, `docs/features/connection-state/spec.md`, `docs/features/README.md` | `developer-ss` |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** ~~red `superseded-close.test.ts` for a close-code mapping~~ struck: the page cannot read the close code (`superdoc.socket` is always `null` in v2, `superdoc.es.js:46416`). Red `d0ae878`, green `7ce7056`, removed in `61fe56e`; the `Superseded` reason and its copy stay.
- [x] **Step 2:** red route tests for `isAttemptSuperseded` with the runtime stub (`0e6fb74`), then the runtime rule (`73bf01b`).
- [x] **Step 3:** red web tests for the ticketed poll, the banner and the action (`61fe56e`), then the implementation (`0d9117b`).
- [x] **Step 4:** E2E bound: the holder-reopens proof waits `SUPERSEDED_SIGNAL_TIMEOUT_MS` for the Failed banner with the Superseded copy and Back to documents (`e016538`).
- [x] **Step 5:** docs: ADR 0036, spec, plan, test plan, room-admission spec, connection-state spec, features README; tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | the rule drifts from the `connected` hook | the walk shows a banner on a tab whose socket still writes, or no banner on a refused one | both read `CreatorReservations.mayWrite`; the E2E and the walk compare them |
| 3 | the first poll runs before the opened document carries a ticket | the signal takes one extra poll | the next poll carries the ticket; the bound stays two intervals |
| 3 | a restart's refused reconnect now shows the Superseded copy | the connection-state restart walk reads the wrong reason | the copy is neutral by design |
| 4 | the E2E bound is too tight under five workers | the 15 s wait fails while the second page is still loading | the bound starts after the first page's editor is mounted; the gate log shows the measured delay |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the banner on the superseded tab and the video of the takeover.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
