# Plan: One colour per member of a document

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the members and open routes (server) and the six colour readers (web), joined by `colorSlot` in `libs/types`.
**Assumptions (decided, owner can override):**
- The server computes the assignment on every members and open request from the join-ordered list; no cache.
- Non-member authors keep the hash through an explicit branch in `useAuthorColorSlots`.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/author-colors.ts`, `author-colors.test.ts`, `libs/types/src/documents.ts`, `apps/server/src/documents/documents-routes.ts`, `documents-routes.test.ts` (or the route test files that exist), `apps/server/src/documents/*` needed for the open route, `apps/web/src/testing/opened-document.ts`, `apps/web/src/features/editor/author-palette.ts`, `author-palette.test.ts`, `superdoc-editor.tsx`, `superdoc-options.ts`, `use-member-cursors.ts`, `members.tsx`, `apps/web/src/features/timeline/use-author-color-slots.ts`, `use-author-color-slots.test.ts`, `contributor-avatars.tsx`, `apps/web/src/features/versions/version-viewer.tsx`, their tests, `e2e/final-visuals.spec.ts` or `e2e/collaboration.spec.ts` | `developer-ac` |

## Sequencing

One group, server first (steps 1-2), then web (3-5), then E2E (6).

## Steps

### G1

- [x] **Step 1:** red unit test for `assignAuthorColorSlots` and the stub; commit alone; then the function; green.
- [x] **Step 2:** `colorSlot` on the members and open responses (types, routes, route tests red first); green.
- [x] **Step 3:** `authorPaletteOf` takes the slot; the editor mounts with `opened.colorSlot`; tests.
- [x] **Step 4:** `members.tsx` and `use-member-cursors.ts` read `member.colorSlot`; tests.
- [x] **Step 5:** `useAuthorColorSlots` for the timeline avatars and the version viewer, with the non-member branch; tests.
- [x] **Step 6:** E2E: two colliding demo users on one document see two colours, consistent across cursor and members list; `pnpm typecheck`; tester briefing.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | the open route loads members on every open and slows the 409 waiting poll | the open route timing test or the E2E waiting proof slows | compute only on the 200 path, after the role check |
| 3 | the SuperDoc user colour is set at mount and never updated | the own cursor keeps the first slot after a members change | the slot comes from the open response, which is captured once per editor generation; documented |
| 5 | timeline avatars flash the hash colour before the members query answers | a colour change visible on load | the avatars render after the members query, which the editor page already holds; the hook reads the cache |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of two members with two colours and the video.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
