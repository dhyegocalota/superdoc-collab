# Plan: Showcase document

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `buildSeedDocx` + `runtime.importRevisions`; `sign-up-gate.ts` claim; `admin-routes.ts`

## Steps

- [ ] **Step 1 (red):** unit tests for `showcase-paragraphs` invariants and `ShowcaseDocuments.create`; commit red alone.
- [ ] **Step 2 (green):** the paragraphs, the shift helper, `ShowcaseDocuments`, wiring in `app.ts`.
- [ ] **Step 3 (red → green):** the admin route and the first-claim hook, with tests.
- [ ] **Step 4 (red → green):** the Admin button (`admin-page.tsx`, `admin-api.ts`, `admin-copy.ts`).
- [ ] **Step 5:** E2E `e2e/showcase.spec.ts` on a fresh stack (first sign-up → showcase in the list → timeline with four contributors and a marked gap); tester briefing; README "Try it" mentions the showcase.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | The SDK import rejects a DOCX whose tracked changes nest or overlap | import logs the error, no events | one tracked change per run, flat, as `buildSeedDocx` renders today |
| 3 | Creating the showcase inside the sign-up hook slows or fails sign-up | sign-up E2E times out | run the creation after the response (fire and forget with logging) |
