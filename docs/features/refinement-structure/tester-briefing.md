# Tester briefing: Refinement — structure

Written by the developer when the lane ends. Nobody on the build side ran `test-plan.md` or the Playwright suite; every behaviour below is a hypothesis.

## What changed, per commit

| Commit | Change |
|---|---|
| `2bdb7c5` chore(format) | Prettier 3.9.10 pinned, `.prettierrc`, `.prettierignore`, scripts `format` and `format:check`, CI step `pnpm format:check` before typecheck in the `verify` job |
| `2bae62f` style | `pnpm format`: 184 files, formatting only |
| `f7647f6` refactor(web) | five version-viewer files moved from `features/editor` to `features/versions`; imports only |
| `e227ebe` test(web) | failing test for the shared formatters (red: `Failed to resolve import "./format-date-time"`) |
| `c3b74ca` refactor(web) | `lib/format-date-time.ts`; three duplicate `Intl.DateTimeFormat` constants removed |
| `0bd016e` refactor(web) | `use-element-width.ts` moved to `lib` |
| `893abda` refactor(server) | `src/deploy/*.test.ts` and `testing/repository-files.ts` moved to `src/repository-shape/`; README, deploy docs, ADR 0013 and one learning updated |
| `b5cad2e` refactor(web) | `src/test` renamed `src/testing`, alias `@/testing/` |
| docs commit | feature README row, plan ticks, this briefing |

## Recorded counts

| Measure | Before format | After format |
|---|---|---|
| `else {` lines in `.ts` and `.tsx` | 0 | 0 |
| `?? ` lines in `.ts` and `.tsx` | 2 | 2 |
| Unit tests: types, history, web, server | 13, 80, 216, 383 (2 skipped) | 13, 80, 216, 383 (2 skipped) |
| Files changed by the format commit | | 184 |

Web unit tests are 218 after the lane: two new tests in `lib/format-date-time.test.ts`. Editor files importing from the timeline feature after Task 2: 2 lines, both in `document-page.tsx`. `DateTimeFormat` appears only in `lib/format-date-time.ts` and two tests.

## Judgment calls

- `.prettierignore` also lists `drizzle` and `.agents/skills`. Without them Prettier rewrote generated drizzle snapshots and journals and vendored skill scripts. Added to the configuration commit; the plan's list is otherwise unchanged.
- `formatBinRange` takes `{ start, end }` (spec and the plan's test), not the old `{ start, binMs }`. Callers in `timeline-tooltip.tsx`, `bin-edits.tsx` and `streamgraph.test.tsx` pass `end: start + binMs`. No assertion changed; only call arguments.
- The format step in `verify.yml` needed no reordering: `ci-workflow.test.ts` pins the docker job and the `pnpm test:unit` step, not the typecheck order.
- Vitest configs: `apps/server/vitest.config.ts` includes `src/**/*.test.ts` and `apps/web/vitest.config.ts` uses `src/test-setup.ts` (not the renamed folder); neither needed edits. The web `tsconfig` alias is `@/*` only.
- Docs: the four `docs/features/deploy/*.md` files and ADR 0013 got one "Moved to" line. The learning Anchor was updated and a `Revisited` line appended. Historic `docs/features/timeline-and-time-travel/plan.md` still cites `src/test/`; left as history.
- `REQUIRE_DOCKER_COMPOSE=true` ran locally (Compose v2.13.0): `src/repository-shape` 47 passed, 0 skipped.
- The Playwright E2E suite was not run.

## How to run

```
pnpm format:check && pnpm typecheck && pnpm test:unit
cd apps/server && REQUIRE_DOCKER_COMPOSE=true npx vitest run src/repository-shape
pnpm test:e2e
```

## Hypotheses to attack

1. The format commit hides a semantic change: diff `2bdb7c5..2bae62f` ignoring whitespace and compare token streams.
2. A moved file lost history: `git log --follow` on each moved path.
3. A doc, rule or script still points at an old path: `rg "src/deploy|@/test/|features/editor/(version|viewer)|timeline-tooltip.*format"`.
4. A Prettier-ignored folder hides unformatted source: the ignore list now includes `drizzle` and `.agents/skills`; the only tracked `.ts` files under ignored paths are `poc/` (by the plan) and one vendored skill example.
5. The banner still shows time only for today and date plus time otherwise.
