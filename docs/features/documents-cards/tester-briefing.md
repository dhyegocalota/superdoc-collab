# Tester briefing: Documents home as cards

Written by the developer; the tester executes `test-plan.md`. Nothing below is proven until the tester proves it.

## What changed

- `libs/history/src/{projection.ts,read-model.ts,schema/read-model.ts}` and migration `read-model/0003_conscious_war_machine` — the projection writes `document_previews` with the cursor.
- `apps/server/src/documents/documents-repository.ts`, `apps/server/src/server.ts` — the repository takes the read model; one extra query per list.
- `libs/types/src/documents.ts` — `DocumentSummary.preview`, `PREVIEW_MAX_CHARACTERS`.
- `apps/web/src/features/documents/*` — cards, thumbnail, card menu, toggle, stored view, page wiring, copy.
- `e2e/documents.spec.ts` — three new tests; two old ones choose the table view first.
- One-line `preview: null` fixture edits outside the lane list: `apps/web/src/features/admin/admin-page.test.tsx`, `apps/web/src/testing/opened-document.ts`.

## How to run

```bash
pnpm dev
```

Sign in as a demo user, open Documents.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/history/src/read-model.test.ts` (2 tests) | `Error: ReadModel.previews is not implemented` | previews table written and read |
| `libs/history/src/projection.test.ts` (2 tests) | `Error: ReadModel.previews is not implemented` | projection commits the preview |
| `apps/server/src/documents/documents-repository.test.ts` list preview | received `undefined` per document where the text and `null` were expected | list joins the read model |
| `apps/server/src/documents/documents-routes.test.ts` upload listing | `expected null to be 'Hello preview'` (the standalone test was later folded into the upload listing test, because the file's sign-up budget returned 429 for an extra server) | route carries the join |
| `use-documents-view.test.ts` (5) | `Error: useDocumentsView is not implemented` | stored view read, validated, written |
| `documents-view-toggle.test.tsx` (3) | `Error: DocumentsViewToggle is not implemented` | radiogroup with two radios |
| `document-thumbnail.test.tsx` (4) | `Error: DocumentThumbnail is not implemented` | mini page from the preview |
| `document-card.test.tsx` (8) | `Error: DocumentCard is not implemented` | card with link, line and menu |
| `documents-page.test.tsx` (4 new) | `Unable to find role="article"`, `Unable to find an element by: [data-testid="document-cards"]`, `Unable to find role="radio" and name "Table"` | page renders cards by default and toggles |

The `owner sees it as mine` repository test is a pin.

## Hypotheses to attack

1. Hypothesis: the preview follows each projection batch and never reads the log at list time. Break it by: edit in two tabs, watch the card; read the server log for a replay during `GET /api/documents`.
2. Hypothesis: the card link covers the whole card. Break it by: keyboard Tab order, clicking the card corner and the thumbnail at 375.
3. Hypothesis: a very long list does not lay out off-screen cards. Break it by: 100 documents, scroll with the performance panel open.
4. Hypothesis: a document with only merged or empty paragraphs gets the title page, not a blank one. Break it by: delete all text then wait for the projection.
5. Hypothesis: the existing E2E specs that open the home by title still pass. Break it by: run `revoke-access`, `showcase`, `final-visuals` and `agent` specs; they were not run by the developer.

## Known gaps

- The spec's More menu was dropped by the lead (the table has no row actions); the card is the link. The spec records it.
- The preview cuts at 400 characters, so a long paragraph can end mid-word.
- The preview replays the log once per batch (`materialize` at the last sequence); no timing measured.
- `.claude/rules/web-ui.md` (Layout) and `.claude/rules/history.md` still describe the table only and no `document_previews`; those files were outside the lane.
- Screenshots (git-ignored): `.pr-media/documents-cards/cards-1280-light.png`, `cards-1280-dark.png`, `cards-375-light.png`, `cards-375-dark.png`, `cards-1280-dark-menu.png`.
