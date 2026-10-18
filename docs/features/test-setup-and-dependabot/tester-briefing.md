# Tester briefing: Test setup under testing, and the two Dependabot alerts

No tester runs this plan: a behaviour-preserving refactor plus a dependency override, proven by `pnpm verify` and refuted by the reviewer (ADR 0030, HARNESS §5).

## What changed

- `apps/web/src/test-setup.ts` → `apps/web/src/testing/setup.ts`; `apps/web/vitest.config.ts` points there. Content unchanged.
- Root `package.json`: `pnpm.overrides["@esbuild-kit/core-utils>esbuild"] = "0.25.12"`. `pnpm-lock.yaml` loses `esbuild 0.18.20` and its binaries.
- Dependabot alert 16 (`braces`, spike lockfile only) dismissed on GitHub as tolerable risk; no file changed for it.

## Hypotheses worth refuting

1. The override reaches `@esbuild-kit/core-utils` only: `rg "esbuild" pnpm-lock.yaml` under `vite`, `vitest`, `tsx` and `drizzle-kit` still shows their own ranges.
2. The overridden `@esbuild-kit/core-utils` still transforms TypeScript: call its `transformSync` directly. `drizzle-kit check` only pins that the config loads, through `tsx`.
3. Nothing imports the setup file by path: `rg test-setup apps/web` outside `docs/`.
