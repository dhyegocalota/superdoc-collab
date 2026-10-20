# Plan: Imported history on first open

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `versionSequenceResolver` in `apps/server/src/history/timeline-service.ts`, and `DocumentPage` in `apps/web/src/features/editor/document-page.tsx`.
**Assumptions (decided, owner can override):**
- The auto-run fires only when the whole-document summary was never written; a stale one waits for a click, so reopening an edited document spends nothing.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/server/src/history/timeline-service.ts`, `apps/server/src/history/timeline-routes.test.ts`, `libs/history/src/read-model.ts` | lead |
| G2 | `apps/web/src/features/versions/version-banner.tsx`, `apps/web/src/features/versions/time-travel.test.tsx`, `apps/web/src/features/timeline/timeline-copy.ts` | lead |
| G3 | `apps/web/src/features/timeline/use-imported-history-summary*`, `apps/web/src/features/editor/document-page.tsx` | lead |

## Sequencing

G1, G2, G3 in order, one lead: the owner asked for the fastest path.

## Steps

### G1

- [x] **Step 1:** failing route test (an imported-only bin answers versionSequence 0, expected the bootstrap mark 1), then the resolver skips the imported sequence.

### G2

- [x] **Step 2:** failing banner test, then `uploadedVersionLabel` when the requested bin ends before the shown version.

### G3

- [x] **Step 3:** hook tests for start once, no imported history, summary already written, reader and filtered view; then the hook and its wiring.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A bin before every live event now opens the bootstrap where it opened 0 | timeline route tests | revert the resolver line |
| 3 | The auto-run spends a model call on every open | the server log shows a summarize per open | the hook decides once and only on `None` |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** written by the lead.
- [x] **Tester run:** the lead's scripted walk on the scenario stack.
- [ ] **Reviewer:** skipped on the owner's request (fastest path).
- [x] **/check-ui:** screenshots of the banner and the opened summary.
- [ ] **/open-pr:** gate, PR, merge, deploy.
