# Plan: Public read-only link

**Spec:** spec.md
**Tier:** 🔴
**Seam:** the Hocuspocus `onAuthenticate` (a fourth socket kind beside member, agent and bootstrap) and a new `/api/public` router mounted outside the session guard.
**Assumptions (decided, owner can override):**
- The document id is the public slug (random UUID).
- The visitor's room is charged to the visitor identity, which holds no per-user heavy-room quota.
- Visitors' awareness frames are silenced on the server, so they have no caret.
- The step that shows visitors in the members row waits for the lane `ai-presence-avatar` to merge, because both change the members payload.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/database/schema/documents.ts`, `apps/server/drizzle/`, `apps/server/src/documents/` (not the members handler), `libs/types/src/routes.ts`, `libs/types/src/documents.ts` (public flag types only) | `developer` |
| G2 | `libs/types/src/public-link.ts`, `libs/types/src/constants.ts`, `apps/server/src/agent/room-tokens.ts`, `apps/server/src/collaboration/public-room-tokens.ts` | `developer` |
| G3 | `apps/server/src/insights/insights-repository.ts`, `apps/server/src/public/`, `apps/server/src/http/app.ts`, `apps/server/src/http/client-address.ts`, `apps/server/src/server.ts` | `developer` |
| G4 | `apps/server/src/collaboration/` (server, attach, authenticate-public, upgrade-path, collaboration-context) | `developer` |
| G5 | `apps/web/src/features/sharing/`, `apps/web/src/features/editor/share-dialog.tsx`, `document-page.tsx`, `editor-header.tsx`, `collaboration-config.ts`, `use-editor-setup.ts`, `apps/web/src/app/router.tsx`, `e2e/public-link.spec.ts` | `developer` |
| G6 | READMEs and `.claude/rules/` facts the change makes wrong | `developer` |
| G7 | members payload, runtime online ids, `members.tsx`, `use-members.ts` (after the lane `ai-presence-avatar` merged) | `developer` |

## Sequencing

G1, G2, G3, G4, G5, G6 in order; each step is a red commit then a green commit. G7 is last and does not start before the lead merges `ai-presence-avatar` into this lane.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### G1: the flag and its owner switch

- [x] **Step 1:** red test that `DocumentsRepository` reads and writes `isPublic` (false by default, per document) and that `GET|PUT /api/documents/:documentId/public` is owner only (editor 403, reader 403, stranger 404, invalid body 400); migration 0009, schema column, repository methods, routes. — evidence: red 215e9b20, green 08e000ad

### G2: identity and token

- [x] **Step 2:** red test for `PublicAnimal`, `anonymousVisitorName`, `anonymousViewerOf` and `signedInViewerOf` (name `Anonymous <Animal>`, animal and colour slot derived from the visitor id, stable per id); `libs/types/src/public-link.ts`. — evidence: red 32c99a86, green 2139a928
- [x] **Step 3:** red test for the public room token (verifies for its document and visitor, expires, refuses another document, refuses an agent or bootstrap token and is refused as one); sign and verify with their own key label. — evidence: red bcc7504d, green f376daf2

### G3: the public HTTP surface

- [x] **Step 4:** red test for `InsightsRepository.latestSelectionSummary` (most recent usable row by `updated_at` across filter keys, failures and empty sentences skipped, none gives null). — evidence: red 67f5cc89, green 901f62bc
- [x] **Step 5:** red test for `GET /api/public/:documentId` (visitor payload with room token and `Anonymous <Animal>`, signed-in non-member real name, member gets `access: member`, missing and flag-off give the same 404 body, no open budget spent, uncommitted room 503, per-address window 429, no email in the body). — evidence: red fd038f48, green 631ce92a
- [x] **Step 6:** red test for `GET /api/public/:documentId/summary` and the allowlist (POST summarize refused, timeline, topics, versions, events, download and comments unreachable without a session and never computed, `topics.ensure` not called, any other path under `/api/public` 404). — evidence: red 1a7c1bae, green 0f7eb671

### G4: the public socket

- [x] **Step 7:** red test that a public token admits a read-only socket at `/collaboration/public`, never a member row, with the Origin, token, flag and window checks (no token, expired, another document, agent token, flag off, Origin missing, window spent). — evidence: red 3e08d95d, green 4d2fbdc1
- [x] **Step 8:** red test that a Yjs update sent from a public connection is not applied to the room and not appended to the update log, with `readOnly` forced off in a second test (the `onChange` refusal alone holds), and that a visitor's awareness frame is silenced. — evidence: pin bb26aff9 (green on arrival, the guards landed in 4d2fbdc1); mutation checks in the tester briefing
- [x] **Step 9:** red test that switching the flag off closes open public sockets and a token minted before cannot join afterwards. — evidence: red a85c952b, green 34184cec

### G5: the web

- [x] **Step 10:** red test for the Share dialog switch (owner sees it, reads the flag, switches it, copies the public link, the copy names who can see the editors) and `public-api.ts`. — evidence: red f8bbe60a, green 37458ef4
- [x] **Step 11:** red test for the public page (member redirect, not-found state, `View only` chip, no toolbar, no share, no Summarize, no edits panel, latest summary card present or absent, preparing state, rate-limit state) and the route outside `RequireSession`. — evidence: red 1b7d66ec, green d9f7833a
- [x] **Step 12:** wire the visitor into the editor (additive props on `superdoc-editor.tsx` and `superdoc-options.ts`: socket path and token), Playwright spec `e2e/public-link.spec.ts`. — evidence: wiring in d9f7833a, fix 6798f48e/243a02a1, e2e/public-link.spec.ts ae2d4406 (6 passed)

### G6: docs

- [x] **Step 13:** README and `.claude/rules/` facts (collaboration, sharing and auth), `docs/features/public-read-only-link/tester-briefing.md`. — evidence: 77776be4, tester briefing

### G7: visitors in the members row (last; do not start before `ai-presence-avatar` merged)

- [ ] **Step 14:** red test for `GET /api/public/:documentId/members` (display name, avatar, colour, online only; no id of a user, no email), the runtime's online public visitors, and members seeing `Anonymous <Animal>` in their row.
- [ ] **Step 15:** the public page shows the members row and the editors' live cursors; E2E asserts the owner sees `Anonymous …` and the anonymous visitor sees the owner online.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | migration 0009 fails on a populated database | the server does not start; `migrate.test.ts` red | the column is additive with a default; drop the migration file and journal row before release |
| 3 | a public token replays as an agent token | `authenticateAgent` accepts it | distinct key label; the cross-use test |
| 5 | an id is enumerable | the 404 body or timing differs between missing and flag-off | one handler answers both |
| 6 | a public GET starts model or projection work | `topics.ensure` called, a worker job queued, a model call in the fake | the router is an allowlist of two GETs; revert the mount |
| 7 | a visitor loads a heavy room without admission | the heap grows with no `HEAVY_ROOMS_REFUSAL_LOG` | the heavy room admission runs in the public admitter |
| 8 | a visitor update reaches the log | `updateLog.read` returns a `public:` row | `onChange` refuses a visitor context |
| 9 | a closed flag leaves sockets open | a visitor keeps receiving text after the switch | `closePublicConnections` and the re-check at admission |
| 12 | the editor sends the placeholder token | the socket is refused at the token step | additive props default to the member path |

**Steps with no backout:** none. Migration 0009 is additive; the flag defaults to off.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
