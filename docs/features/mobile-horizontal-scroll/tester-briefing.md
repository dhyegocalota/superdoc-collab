# Tester briefing: Nothing scrolls sideways on a phone

Written by developer-mo. The developer did not run `test-plan.md`, ran the one E2E spec only and does not declare the feature works.

## What changed

Part 1 only (documents list). Part 2 (comments on phones) is not built.

- `document-table.tsx`: below `lg` the rows render as a list of stacked items; from `lg` the table is unchanged.
- `documents-copy.ts`: the separator of the muted line.
- `document-table.test.tsx` (new), `e2e/documents.spec.ts` (one test), `docs/features/README.md` row.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/documents
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| filled in at step 1 | | |

## Hypotheses to attack

1. Hypothesis: no title, however long or unbroken, widens the card below `lg`. Break it by: a 200 character title with no spaces at 320 px.
2. Hypothesis: the table is identical from `lg`. Break it by: 1024 and 1280 against main.
