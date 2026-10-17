# Test plan: Test setup under testing, and the two Dependabot alerts

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `. Behaviour-preserving refactor and a dependency override: the lead ticks with the gate output and the reviewer refutes (ADR 0030).

## The moved setup file

- [x] `pnpm --filter @superdoc-collab/web test:unit` — expected: every file passes; the tests that need the `ResizeObserver` and `matchMedia` doubles (editor header, members, timeline) stay green — evidence: 58 files, 431 tests passed on the working tree of this branch
- [x] `rg -n "test-setup" apps/web --glob '!node_modules' --glob '!dist'` — expected: no match — evidence: exit 1, no output
- [x] `vitest.config.ts` names `src/testing/setup.ts` — expected: one `setupFiles` entry, the moved path — evidence: the diff of `apps/web/vitest.config.ts`

## The esbuild override

- [x] `rg -n "^  /esbuild@" pnpm-lock.yaml` — expected: no `0.18.x` entry — evidence: lines for `0.25.12` and `0.28.2` only
- [x] `pnpm security:audit` — expected: "No known vulnerabilities found" — evidence: that line on this branch
- [x] `pnpm exec drizzle-kit check` in `apps/server` — expected: the config file is read and the output ends "Everything's fine" — evidence: "Reading config file …/drizzle.config.ts" then "Everything's fine 🐶🔥"
- [x] `pnpm verify` (class `product`, every gate) — expected: green — evidence: see the PR body

## The spike's alert

- [x] `gh api repos/dhyegocalota/superdoc-collab/dependabot/alerts/16 --jq '.state'` — expected: `dismissed`, reason `tolerable_risk` — evidence: the PATCH reply `{"dismissed_reason":"tolerable_risk","state":"dismissed"}`
- [x] `rg -n "^  /braces@" pnpm-lock.yaml` — expected: no match in the product lockfile — evidence: no output
