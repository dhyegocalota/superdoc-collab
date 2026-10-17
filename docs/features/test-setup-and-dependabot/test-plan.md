# Test plan: Test setup under testing, and the two Dependabot alerts

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `. Behaviour-preserving refactor and a dependency override: the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## The moved setup file

- [x] `pnpm --filter @superdoc-collab/web test:unit` — expected: every file passes; the tests that need the `ResizeObserver` and `matchMedia` doubles (editor header, members, timeline) stay green — evidence: 58 files, 431 tests passed on the working tree of this branch
- [x] `rg -n "test-setup" apps/web --glob '!node_modules' --glob '!dist'` — expected: no match — evidence: exit 1, no output
- [x] `vitest.config.ts` names `src/testing/setup.ts` — expected: one `setupFiles` entry, the moved path — evidence: the diff of `apps/web/vitest.config.ts`

## The esbuild override

- [x] `rg -n "^  /esbuild@" pnpm-lock.yaml` — expected: no `0.18.x` entry — evidence: lines for `0.25.12` and `0.28.2` only
- [x] `pnpm security:audit` — expected: "No known vulnerabilities found" — evidence: that line on this branch
- [x] `transformSync('const x: number = 1; export default x', 'a.ts', { format: 'esm' })` from the installed `@esbuild-kit/core-utils` — expected: valid ESM output under esbuild 0.25.12 — evidence: `const x=1;var a_default=x;export{a_default as default};`
- [x] `rg -c esbuild-kit` on `drizzle-kit`'s `bin.cjs` and `api.js` — expected: zero, the loader is declared and never loaded; `tsx` is referenced — evidence: 0 matches for `esbuild-kit`, 3 for `"tsx`
- [x] `pnpm exec drizzle-kit check` in `apps/server` — expected: the config still loads (through `tsx`, so a pin only, not a proof of the override) — evidence: "Reading config file …/drizzle.config.ts" then "Everything's fine 🐶🔥"
- [x] `pnpm verify all` (class `product`, every gate) — expected: green — evidence: 8 gates green at merge base b94e6fb: doctor 1s, format 2s, secrets 2s, typecheck 2s, audit 1s, unit 337s (Asia/Kolkata), e2e 126s, docker 44s; summary posted on [PR #42](https://github.com/dhyegocalota/superdoc-collab/pull/42#issuecomment-6241013263)

## The spike's alert

- [x] `gh api repos/dhyegocalota/superdoc-collab/dependabot/alerts/16 --jq '.state'` — expected: `dismissed`, reason `tolerable_risk` — evidence: the PATCH reply `{"dismissed_reason":"tolerable_risk","state":"dismissed"}`
- [x] `rg -n "^  /braces@" pnpm-lock.yaml` — expected: no match in the product lockfile — evidence: no output
