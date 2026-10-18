# Plan: Member presence

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `members.tsx`, `use-member-cursors.ts`, `timeline-notices.tsx`.
**Assumptions (decided, owner can override):**
- The staleness of defect 1 is the poll, not the socket: `destroy()` already closes the provider on unmount.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/use-member-cursors.ts`, `members.tsx`, `editor-header.tsx`, `members.test.tsx`, `use-member-cursors.test.ts` | `developer-ca` |
| G2 | `apps/web/src/features/editor/members.tsx`, `members.test.tsx` | `developer-ca` |
| G3 | `apps/web/src/features/timeline/timeline-notices.tsx`, `timeline-notices.test.tsx` | `developer-ca` |

## Sequencing

G1, G2, G3 in order (G1 and G2 share `members.tsx`).

## Steps

### G1: stale presence

- [x] **Step 1:** red test that a peer caret leaving invalidates the members query; `Members` takes `documentId`; `presenceKey` and the invalidation. — evidence: red c637a309, green 24f8cbfa

### G2: one label rule

- [x] **Step 2:** red test that a jumpable member is named `Bruno, online` and described by the jump text; name by `memberLabel`, describe by the jump text or the reason. — evidence: red 1a3a3be5, green 75598460

### G3: empty copy

- [x] **Step 3:** red test that no empty copy shows while the projection is behind; add the condition. — evidence: red 5c0039b3, green 278f4285

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | an invalidation loop | the members request repeats without a caret change | revert; the key only changes on appear or disappear |
| 2 | the jump button loses its announced purpose | a screen reader hears only the name | the description carries it; revert if tests show otherwise |
| 3 | the empty copy never shows | a brand-new document shows nothing | revert; `isBehind` is false once the projection caught up |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
