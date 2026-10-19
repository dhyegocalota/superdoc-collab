# Documents home as cards, with a table option

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner: "faz a home suportar cards e table ao inves de so table; dai os cards terao que ter o thumbnail gerado de forma performatica ok; e por padrao quero cards, sao mais bonitos e tem que funcionar super bem em mobile e sem travar e sem overload o server")
**ADRs:** [0007](../../adr/0007-read-model.md) (the projection worker writes the read model)
**Not changing:** the documents API's authorization, the table's columns and actions, the empty state of welcoming-surfaces, the upload flow

## Problem

The documents home is a table only. The owner wants cards by default, each with a thumbnail, that stay smooth on a phone and cost the server nothing per view.

## Design (recommended; the owner can override the visual choices)

- **View toggle.** A segmented control above the lists (`DocumentsViewToggle`, icons LayoutGrid and List from lucide, labels `CARDS_VIEW_LABEL` and `TABLE_VIEW_LABEL`, `role="radiogroup"`), stored under `superdoc-collab.documents-view` (`DocumentsView` enum: `Cards`, `Table`; default `Cards`; a stored value that is not a `DocumentsView` is removed, like the panel position). Mine and Shared both follow the choice.
- **Cards.** `DocumentCard`: a link to the document, the thumbnail on top, the title (two-line clamp), one muted line with owner (Shared) or role, and "edited <relative time>" through `format-date-time.ts`, and no More menu: the whole card is the link, one tap target. Grid: one column at 375, two from `sm`, three from `lg`, four from `xl`; cards are `aspect-[4/5]` thumbnails with `content-visibility: auto` and `contain-intrinsic-size` so a long list never lays out off-screen cards; images and SVGs are never used for the thumbnail.
- **Thumbnail, generated once per change on the server, drawn by CSS on the client.** The projection worker already applies every new update to the document's blocks (`libs/history/src/projection.ts`); it now also writes a `document_previews` row (`document_name`, `sequence`, `preview` = the first `PREVIEW_MAX_CHARACTERS` (400) characters of the main story's paragraph texts joined by newlines) through `ReadModel` in the same transaction as the cursor. The list endpoint (`GET /api/documents`) joins it and returns `preview: string | null` per document (null until the first projection). The card draws a mini page (`DocumentThumbnail`): paper background, the first lines of `preview` as tiny text with the author-neutral foreground, clamped to the page box, and a soft shadow; a null preview draws the page with the title only. No per-card request, no SDK, no browser rendering, nothing at list time beyond the join.
- **Invalidation.** The list query already refetches on focus and after mutations; the preview changes only when the projection advances, so no new polling. A document uploaded or created shows its preview after its first projection (seconds).
- **Mobile.** Cards are the default there; the toggle still allows the table (which keeps its stacked rows).

### Failure handling

| Case | Behaviour |
|------|-----------|
| Preview row missing | `preview: null`, the card draws the title page |
| Projection behind | the previous preview stays until the next batch |
| localStorage unavailable | the default (`Cards`) is used; the choice is not kept |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| The spec put the row's existing actions in a More menu, but the table has none (rename, delete and download live in the editor). What does the card hold? | More menu with Open and Copy link; no menu | Premise corrected by the lead: drop the More menu, the whole card is the link | 2026-10-19 |

## Test strategy summary

Unit: `ReadModel` writes and reads the preview with the cursor; `projectPending` produces the preview text (first 400 characters, newline-joined); the list route returns `preview`; `DocumentsViewToggle` default and persistence; `DocumentCard` content; `DocumentThumbnail` with text and with null. E2E (`e2e/documents.spec.ts`): the home opens in cards by default; after typing in a document and returning, the card shows the text; the toggle switches to the table and the choice survives a reload; at 375 the grid is one column with no horizontal scroll.
