# Equal card heights on the documents home

**Status:** Shipped 2026-10-19
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "the cards have different heights, how sad"; screenshot: a two-line title makes its card taller than its neighbours)
**Not changing:** the thumbnail, the grid columns, the card's content

## Change

- Every card in a row has the same height: the grid keeps `items-stretch`, the card is `h-full flex flex-col`, the thumbnail keeps its aspect ratio, and the footer reserves two title lines at every width (`line-clamp-2` plus a fixed two-line block height from the line height, through a `min-h` on the title), so a one-line title leaves the second line empty instead of shrinking the card.
- The meta line (role and relative time) keeps one line with `truncate`.

## Test list

- `document-card.test.tsx`: the title carries the two-line clamp and the two-line minimum height; the card is `h-full`.
- E2E `e2e/documents.spec.ts`: two cards, one with a long title and one with a short one, have equal bounding-box heights at 1280 and 375.
