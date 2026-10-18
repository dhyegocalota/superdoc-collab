# Plan: Member presence

**Spec:** spec.md
**Tier:** 🟡
**Seam:** the `awareness-update` subscription in `members.tsx`; the `onEditorUpdate` callback of `superdoc-editor.tsx` into `timeline-panel.tsx`.
**Assumptions (decided, owner can override):**
- The staleness of defect 1 is the poll, not the socket: `destroy()` already closes the provider on unmount.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/members.tsx`, `editor-header.tsx`, `members.test.tsx`, `e2e/final-visuals.spec.ts`, `libs/types/src/constants.ts` | `developer-ca` |
| G2 | `apps/web/src/features/editor/members.tsx`, `members.test.tsx` | `developer-ca` |
| G3 | `apps/web/src/features/timeline/timeline-notices.tsx`, `timeline-panel.tsx`, `use-last-edit-at.ts`, their tests, `apps/web/src/features/editor/superdoc-editor.tsx`, `document-page.tsx`, `libs/types/src/constants.ts` | `developer-ca` |

## Sequencing

G1, G2, G3 in order (G1 and G2 share `members.tsx`).

## Steps

### G1: stale presence

- [x] **Step 1:** red test that a peer caret leaving invalidates the members query; `Members` takes `documentId`; `presenceKey` and the invalidation. — evidence: red c637a309, green 24f8cbfa

### G1b: bound the invalidation

- [x] **Step 1b:** red test that a burst of presence changes during a members fetch calls `invalidateQueries` once with `{ cancelRefetch: false }` and starts no second fetch; derive the peer id set, debounce by the cooldown constant. — evidence: red 55b15f7c, green 273474bc
- [x] **Step 1c:** review round: the trigger is SuperDoc's `awareness-update` (added or removed), not rendered carets; constant renamed `MEMBERS_PRESENCE_DEBOUNCE_MS` (a2ac2f91); E2E a signed-out member reads offline within 1.5 s (a77d5e5e). — evidence: red 029e19b8, green c71b56e8

### G2: one label rule

- [x] **Step 2:** red test that a jumpable member is named `Bruno, online` and described by the jump text; name by `memberLabel`, describe by the jump text or the reason. — evidence: red 1a3a3be5, green 75598460

### G3: empty copy

- [x] **Step 3:** red test that no empty copy shows while the projection is behind; add the condition. — evidence: red 5c0039b3, green 278f4285
- [x] **Step 3b:** the recorder's 0.85 s flash: red test that the notices hide the empty copy while the log is ahead; gate it. — evidence: red 784fc116, green 5627e319
- [x] **Step 3c:** red test that the panel computes the log as ahead from an edit newer than the last timeline answer. — evidence: red 39beea78, green 573111fd
- [x] **Step 3d:** red test that the editor reports every editor update; wire it. — evidence: red 05f908c2, green 220cdee0
- [x] **Step 3e:** red test that the last edit time is marked at most once per interval; hook and page wiring. — evidence: red b5e78e00, green 62af6087

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | an invalidation loop or a starved poll | the members request repeats without a peer joining or leaving, or an in-flight fetch is cancelled | revert; the key is the set of peer ids with a caret, the call is debounced and never cancels a fetch |
| 2 | the jump button loses its announced purpose | a screen reader hears only the name | the description carries it; revert if tests show otherwise |
| 3 | the empty copy never shows | a brand-new document shows nothing, or one that was edited and emptied again | the next timeline answer lifts the gate; revert the edit mark if not |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
