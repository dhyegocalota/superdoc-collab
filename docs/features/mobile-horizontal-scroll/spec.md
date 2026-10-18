# Nothing scrolls sideways on a phone

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the owner reported the sideways scroll on their phone and asked for the fix)
**ADRs:** none
**Lane:** product
**Not changing:** the documents table from `lg` and up (columns, headers, the hidden columns of the Shared list between `sm` and `lg`, the `ROLE_LABELS` copy); the list query, the empty messages and the skeleton; the editor page, which does not overflow at 375 px.

## Problem

On a phone the documents list table is 766 px wide inside a 375 px card. The title is cut and the card scrolls sideways. Reproduced at 375 x 812 on a copy of production. `.claude/rules/web-ui.md` holds the rule that no page scrolls sideways.

## Goals

### Documents list on phones

- Below `lg` (the one phone rule, `useIsPhoneLayout`), each document is a stacked row: the title on top, wrapping to two lines at most with an ellipsis after that; under it one muted line holding the owner, the updated time and, in Shared, the access label.
- The title link is the row's action and keeps a 44 px touch target.
- No column is clipped and the card never scrolls sideways at 375 or 320 px, for long titles included.
- The rows show the same data at every width; from `lg` the table is unchanged.

### Comments on phones

Decided after a spike, see the lead. This section is filled in before the second part is built.

## Non-goals

- A redesign of the card, new actions on the row, sorting or paging.
- The Edits panel, which `summary-mobile` already covers.

## Design

### Data flow

1. `DocumentTable` reads `useIsPhoneLayout`. From `lg` it renders the existing table.
2. Below `lg` it renders the same documents as a list inside the same bordered card: one list item per document. The item holds the title link (`line-clamp-2`, minimum height 44 px) and one muted paragraph.
3. The muted paragraph joins the cells the table would show for that kind, minus the title, in the order of `COLUMNS_BY_KIND`, with the separator from `documents-copy.ts`. The cell renderers are shared, so the formatting of the time and the access label has one source.

### Interfaces

- `DocumentTable` props are unchanged.
- `documents-copy.ts` gains the separator of the muted line.

### Failure handling

- An empty list keeps its message; nothing renders as a list.
- A title with no spaces still wraps: the link breaks long words.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Table or stacked rows on a phone | A scroll the table, B hide columns, C stacked rows | C, by the lead under the owner's request | 2026-10-18 |

## Test strategy summary

- Unit (red first), `document-table.test.tsx`: with the viewport below `lg`, Mine and Shared render a list with one item per document, no table and no column header; each item has the title link and one line with the owner, the time and the access label as the table would show them; from `lg` the table and its headers remain.
- E2E at 375 x 812 in `e2e/documents.spec.ts`: the documents card has `scrollWidth <= clientWidth` and a long title is fully visible.
- Walk at 375, 320 and 1280 in both themes.
