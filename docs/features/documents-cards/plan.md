# Plan: Documents home as cards

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `libs/history/src/read-model.ts` (`document_previews`), `apps/server/src/documents/documents-repository.ts` (`selectSummaries`), `apps/web/src/features/documents/documents-page.tsx`

## Steps

- [x] **Step 1:** `ReadModel.commit` takes an optional `preview`, writes `document_previews` in the cursor transaction; `ReadModel.previews(documentNames)` reads many in one query; `forget` clears it. Migration `libs/history/drizzle/read-model/0003_conscious_war_machine.sql`. — red 751cc21b, green 6c3cd1df
- [x] **Step 2:** `projectPending` passes the preview (main story paragraphs not merged away, newline-joined, first `PREVIEW_MAX_CHARACTERS`) on the bootstrap commit and on every batch. — 6c3cd1df
- [x] **Step 3:** `DocumentSummary.preview`; `DocumentsRepository` takes the read model and `selectSummaries` makes one `previews` query for the whole list. — red 10816fed, green 20036629
- [x] **Step 4:** `useDocumentsView`, `DocumentsViewToggle`, `DocumentThumbnail`, `DocumentCard`, `DocumentCardActions`, `DocumentCards`; the page picks the list by view. — red b6fa250d, green 11077ff6
- [x] **Step 5:** E2E: cards by default with the typed text on the card, the toggle surviving a reload, one column at 375. — 7b6fecc8

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 1 | A batch commit slows because the preview replays the log | projection timings in the worker | write the preview only on the last batch of a run |
| 3 | `IN (…)` with a very long list | SQLite variable limit error on `GET /api/documents` | chunk the ids |
| 4 | `content-visibility: auto` clips the focus ring | ring cut off on the card edge | drop the intrinsic size, keep the grid |

**Steps with no backout:** the migration (additive table; the previous code ignores it).
