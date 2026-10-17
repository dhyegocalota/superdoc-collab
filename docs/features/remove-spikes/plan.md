# Plan: Remove spikes

**Spec:** spec.md
**Tier:** 🟢
**Seam:** repository layout

## Steps

- [x] **Step 1:** red: `delivery-docs.test.ts` "no spike or proof-of-concept code is committed at the root".
- [ ] **Step 2:** move the results and screenshots, delete `spikes/`, fix the links, `.prettierignore`, `AGENTS.md`, HARNESS §1.
- [ ] **Step 3:** `pnpm verify`, reviewer, PR, merge.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | A link still points into `spikes/` | `delivery-docs.test.ts` | fix the link |

**Steps with no backout:** none; the code stays in `c1ada06`.
