# Tester briefing: Nothing scrolls sideways on a phone

Written by developer-mo. The developer did not run `test-plan.md`, ran the one E2E spec only and does not declare the feature works.

## What changed

Documents list only. Comments on phones stay SuperDoc's inline cards; nothing was built for them.

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
| `document-table.test.tsx::below lg a shared document is a list item with the title link and one muted line`, 523d906 | `Unable to find role="listitem"` because the table renders | d1b9d49 |
| `document-table.test.tsx::below lg a document of Mine shows only the time under the title`, 523d906 | same | d1b9d49 |
| `document-table.test.tsx::from lg the table and its column headers remain`, `::an empty list shows its message at any width` | pin | pin |

## Hypotheses to attack

1. Hypothesis: no title, however long or unbroken, widens the card below `lg`. Break it by: a 200 character title with no spaces at 320 px.
2. Hypothesis: the table is identical from `lg`. Break it by: 1024 and 1280 against main.
