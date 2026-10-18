# Plan: Nothing scrolls sideways on a phone

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `DocumentTable` (the phone rendering) and `documents-copy.ts` (the separator).
**Assumptions (decided, owner can override):**
- "Phone" means below the `lg` breakpoint, `useIsPhoneLayout`.
- The row has no action besides the title link, so the 44 px touch target is the link.
- Comments on phones need no change: SuperDoc's inline cards below 480 px stay (spec, decided by the lead).

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/documents/document-table.tsx`, `document-table.test.tsx` (new), `documents-copy.ts`, `e2e/documents.spec.ts`, `docs/features/README.md` (this fix's row) | `developer-mo` |

## Sequencing

One developer, steps in order.

## Steps

### G1

- [x] **Step 1:** red unit test in `document-table.test.tsx`: below `lg` the stacked list; from `lg` the table. — evidence: red 523d906
- [x] **Step 2:** the phone rendering in `DocumentTable` and the separator copy; green. — evidence: green d1b9d49 (`documents-page.test.tsx` now stubs a wide viewport, because jsdom counts as a phone)
- [x] **Step 3:** E2E at 375 x 812: the card never scrolls sideways and the full title is visible; `pnpm typecheck`; tester briefing; the README row. — evidence: E2E in the next commit, run once and green; `pnpm typecheck` green

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | a long unbroken title still widens the card | the E2E `scrollWidth` check at 375 | `break-words` on the title |
| 2 | the muted line drops the access label in Shared | the unit test reads the line | render the shared cell renderers for every non-title column |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots at 375, 320 and 1280 in both themes.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
