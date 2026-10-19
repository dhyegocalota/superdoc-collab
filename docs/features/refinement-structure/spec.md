# Refinement: structure — spec

- Status: Shipped 2026-10-17
- Tier: green (moves, renames and a formatter; no behaviour change).
- Owner approval: approved 2026-10-17 (refinement proposal, first of five lanes: structure → tests → readability-server ∥ ux-care → readability-web).
- ADRs: none new; [0008](../../adr/0008-vertical-slices.md) (one folder per slice stays).
- Not changing: any runtime behaviour, any public path, any test assertion, `poc/`, `libs/history/src` layout (regrouping deferred).

## Problem

A read-only structure audit (2026-10-17) found a second feature hiding in `apps/web/src/features/editor/` (the version viewer: banner, frame, viewer, messages), which creates an import cycle editor → timeline (10) and timeline → editor (5); three identical `Intl.DateTimeFormat` constants; a generic hook and two generic formatters living inside the timeline feature; a server folder named `deploy/` that holds repository-shape tests and collides with the root `deploy/` (see the 2026-10-17 learning); a web test-helper folder named `test/` while the server and the history library use `testing/`; and no formatter, with 41 source lines over 220 characters.

## Goals

1. The repository is formatted once with Prettier (print width 140, single quotes, semicolons, trailing commas) and CI refuses unformatted code.
2. The version viewer lives in `apps/web/src/features/versions/` with its test; the editor feature no longer imports from the timeline feature except through `versions`.
3. `apps/web/src/lib/format-date-time.ts` owns `formatTimestamp`, `formatBinRange` and `formatTimeOfDay`; the three duplicate formats are gone.
4. `apps/web/src/lib/use-element-width.ts`.
5. `apps/server/src/repository-shape/` holds the five repository-shape test files and their `repository-files.ts` helper.
6. `apps/web/src/testing/` replaces `apps/web/src/test/` (alias `@/testing/`).

## Decisions

| Question | Options | Decision | Date |
|---|---|---|---|
| Formatter | none · Prettier · Biome | Prettier, print width 140, formatted once as the first commit, `format:check` in the `verify` job; Markdown, YAML and generated SQL ignored so docs and the pinned CI workflow do not churn | 2026-10-17 (owner) |
| Low-value renames (`me.ts`, `health.ts`, `members.tsx`) | rename · keep | keep | 2026-10-17 |
| `libs/history/src` subfolders | regroup · keep | keep (40 import edits for little reader gain) | 2026-10-17 |

## Interfaces

- `apps/web/src/lib/format-date-time.ts`: `formatTimestamp(ms: number): string`, `formatBinRange({ start, end }: { start: number; end: number }): string`, `formatTimeOfDay(ms: number): string` (the banner's time-only format), each backed by one module-level `Intl.DateTimeFormat`.
- `apps/web/src/features/versions/{version-banner,version-frame,version-viewer}.tsx`, `viewer-messages.ts`, `time-travel.test.tsx`.
- `apps/server/src/repository-shape/{repository-files,ci-workflow.test,compose.test,delivery-docs.test,dockerfile.test,entrypoint.test}.ts`.
- Root: `.prettierrc`, `.prettierignore`, scripts `format` and `format:check`.

## Tests

No assertion changes. Proof is `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e` and `pnpm format:check` green, plus `rg` counts showing the editor → timeline imports are gone and `@/test/` has no importer. One new unit file for the moved formatters (`format-date-time.test.ts`), since they become a shared module.

## Known gaps after this change

- `features/versions` still imports `features/editor` (collaboration config, editor API) and `features/timeline` (copy, time-travel hook); the remaining cycle timeline → versions is addressed by lane C2.
