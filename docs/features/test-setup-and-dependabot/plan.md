# Plan: Test setup under testing, and the two Dependabot alerts

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `vitest.config.ts` `setupFiles` and the root `package.json` `pnpm.overrides`
**Assumptions (decided, owner can override):**
- Behaviour-preserving refactor plus a dependency override: no tester; the lead ticks the test plan with the gate output and the reviewer refutes it ([ADR 0030](../../adr/0030-the-local-gate-runs-what-the-diff-can-break.md)).
- The override is scoped to `@esbuild-kit/core-utils>esbuild`, never to `esbuild` globally, so Vite's and tsx's own esbuild resolution is untouched. `drizzle-kit` never loads the loader it declares; the override is proven by exercising `core-utils` directly.
- The spike's alert is dismissed rather than fixed: there is no fixed `braces`, and the spike is throwaway and never deployed; [PR #41](https://github.com/dhyegocalota/superdoc-collab/pull/41) removed the whole `spikes/` tree, manifest included.

## File map

| Group | Paths owned | Developer |
|-------|-------------|-----------|
| G1 | `apps/web/src/testing/setup.ts` (moved), `apps/web/vitest.config.ts`, `package.json`, `pnpm-lock.yaml` | lead |
| G2 | `docs/features/test-setup-and-dependabot/`, `docs/features/README.md` | lead |

## Steps

- [x] **Step 1:** `git mv apps/web/src/test-setup.ts apps/web/src/testing/setup.ts`; `setupFiles: ['src/testing/setup.ts']`. — evidence: `pnpm --filter @superdoc-collab/web test:unit`, 58 files, 431 tests passed
- [x] **Step 2:** root `package.json` override `"@esbuild-kit/core-utils>esbuild": "0.25.12"`; `pnpm install`. — evidence: `rg "^  /esbuild@" pnpm-lock.yaml` lists 0.25.12 and 0.28.2 only; `core-utils` `transformSync` under 0.25.12 emits `const x=1;var a_default=x;export{a_default as default};`
- [x] **Step 3:** dismiss alert 16 as `tolerable_risk` through `gh api`. — evidence: `{"dismissed_reason":"tolerable_risk","state":"dismissed"}`
- [x] **Step 4:** spec, plan, test plan, tester briefing, features index row. — evidence: this folder

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A test relied on the setup path by import | the web unit suite fails to resolve `test-setup` | `rg test-setup apps/web` finds nothing outside docs; revert the move |
| 2 | `@esbuild-kit/core-utils` calls an esbuild API removed between 0.18 and 0.25 | `transformSync` from the installed `core-utils` throws or emits wrong output | remove the override and reinstall |
