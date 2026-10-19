# Test setup under testing, and the two Dependabot alerts

**Status:** Shipped 2026-10-17
**Tier:** 🟢
**Owner approval:** approved 2026-10-17
**ADRs:** [0022](../../adr/0022-mechanical-security-gates-and-a-security-reviewer.md), [0030](../../adr/0030-the-local-gate-runs-what-the-diff-can-break.md)
**Not changing:** the web unit tests themselves, `drizzle-kit`'s version, the spike under `spikes/sdk-room-join/` and its lockfile (they leave the tree with [PR #41](https://github.com/dhyegocalota/superdoc-collab/pull/41)), `docs/features/*/plan.md` that cite the old setup path as history

## Problem

`apps/web/src/testing/` holds every helper that exists only for tests, except the Vitest setup file, which sat alone at `apps/web/src/test-setup.ts` and was named only by `vitest.config.ts`.

Two Dependabot alerts were open:

- Alert 1, medium, `esbuild <= 0.24.2` in the root lockfile: `drizzle-kit 0.31.11` (the latest release) still declares the deprecated `@esbuild-kit/esm-loader`, whose `@esbuild-kit/core-utils` resolves `esbuild ^0.18`. Its bundles never load that loader (they reference `tsx` only), so the dependency is dead weight the lockfile still has to resolve. No upgrade of a direct dependency removes it.
- Alert 16, high, `braces <= 3.0.3` in `spikes/sdk-room-join/pnpm-lock.yaml`: reached through `@superdoc/cli` → `fast-glob` → `micromatch`. `braces 3.0.3` is the latest release, so no patched version exists. The product lockfile does not contain `braces`.

## Change

- `apps/web/src/test-setup.ts` moves to `apps/web/src/testing/setup.ts`; `vitest.config.ts` points `setupFiles` there. Behaviour-preserving.
- The root `package.json` gains the pnpm override `"@esbuild-kit/core-utils>esbuild": "0.25.12"`, the esbuild the rest of the tree already resolves. The lockfile drops `esbuild 0.18.20` and its platform binaries. `@esbuild-kit/core-utils` transforms TypeScript correctly under 0.25.12, so the override is safe even for a consumer that did load it. The override goes when `drizzle-kit` drops `@esbuild-kit/esm-loader`.
- Alert 16 is dismissed on GitHub as `tolerable_risk` with the chain and the absence of a patched release in the comment; nothing in the repository changes for it. The dismissal is interim: the manifest leaves the tree with [PR #41](https://github.com/dhyegocalota/superdoc-collab/pull/41).

## Tests

- The web unit suite passes with the moved setup file (the `ResizeObserver` and `matchMedia` doubles it installs are what several component tests depend on).
- `pnpm security:audit` reports no known vulnerabilities.
- `@esbuild-kit/core-utils` `transformSync` on a TypeScript snippet emits correct ESM under the overridden esbuild.
- `pnpm exec drizzle-kit check` in `apps/server` still reads `drizzle.config.ts`: a pin that the config loads, not a proof of the override, since `drizzle-kit` loads it through `tsx`.
- No `esbuild@0.18` entry remains in `pnpm-lock.yaml`.
