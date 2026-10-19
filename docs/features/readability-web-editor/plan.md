# Plan: Readability in the editor and the timeline panel

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/editor` and `apps/web/src/features/timeline`, outside the excluded files named in the spec.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/**`, `apps/web/src/features/timeline/{timeline-panel,timeline-notices}.*` and new files beside them | `developer-ca` |

## Sequencing

One developer, steps in order, one commit per step.

## Steps

- [x] **Step 1:** `DocumentPage` folds the reload tails and the waiting branches, then splits into named parts; `document-page.test.tsx` pins it. Evidence: a380343c.
- [x] **Step 2:** `TimelinePanel` splits into named parts and drops `ignoreTravel`; `timeline-panel.test.tsx` pins it. Evidence: 088aa807 (red), 0c8ccc7a, 7b57076e.
- [x] **Step 3:** `TimelineNotices` models `lagMs` explicitly; `timeline-notices.test.tsx` pins it. Evidence: 043053a4.
- [x] **Step 4:** sweep the editor and timeline panel files; the touched unit files pin it. Evidence: f5321241.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | The reload flow or a waiting screen changes | `document-page.test.tsx` fails | revert the commit |
| 2 | The panel DOM or the phone travel changes | `timeline-panel.test.tsx` fails | revert the commit |
| 3 | The lag notice appears or hides at the wrong time | `timeline-notices.test.tsx` fails | revert the commit |
| 4 | A rewrite changes behaviour | the touched unit files fail | revert that commit |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** the local gate green, learnings sweep stated, PR opened.
