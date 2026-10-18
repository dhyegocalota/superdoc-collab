# Plan: Sign-out commits the sign-in route before the session flips

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `use-sign-out.ts`, `main.tsx`.
**Assumptions (decided, owner can override):**
- `react-router/dom` `RouterProvider` is the only way to enable `flushSync` on `navigate`.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/auth/use-sign-out.ts`, `sign-out-flow.test.tsx`, `sign-out-menu-item.test.tsx`, `apps/web/src/main.tsx`, `apps/web/src/testing/render-with-providers.tsx`, `docs/features/sign-out-flush-sync/`, `docs/features/sign-out-redirect-race/`, `docs/learnings/`, `docs/features/README.md` row | `developer-sm` |

## Sequencing

Red test, then the fix, then the docs.

## Steps

### G1

- [x] **Step 1:** red test with a sign-in route that renders for 10 ms. — evidence: 8efe42b6
- [x] **Step 2:** `react-router/dom` in `main.tsx` and the helpers; `flushSync: true` in `useSignOut`; order pin renamed; menu-item pin updated. — evidence: 7f798e83
- [ ] **Step 3:** docs, learning and the restated claims.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 2 | `react-router/dom` changes how the router hydrates or scrolls | a route test fails or the app renders blank | revert the import and the option |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
