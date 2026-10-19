# Test plan: Documents home as cards

Unit rows are the developer's loop; the tester runs the browser rows through Playwright MCP.

## Unit and E2E (developer, green at 14dffaf1)

- [x] `libs/history` read-model.test.ts: preview written with the cursor, replaced by the next commit, cleared by forget — red 751cc21b, 6 passed
- [x] `libs/history` projection.test.ts: newline-joined texts after each batch, stops at 400 characters — red 751cc21b, 9 passed
- [x] `apps/server` documents-repository.test.ts: list and summary carry the preview, null before the first projection — 8 passed
- [x] `apps/server` documents-routes.test.ts: `GET /api/documents` returns the preview — 53 passed
- [x] `apps/web` use-documents-view, documents-view-toggle, document-thumbnail, document-card, documents-page — 5, 3, 4, 8, 19 passed
- [x] `pnpm test:e2e e2e/documents.spec.ts` — 18 passed
- [x] `pnpm typecheck` and `pnpm typecheck:e2e` — clean

## Walk (tester)

- [ ] Sign in as Ana, upload a docx and type a sentence, return to Documents — the card shows the sentence within seconds (reload if the list has not refetched)
- [ ] Cards are the default; Mine and Shared follow the toggle; the choice survives a reload and a sign-out in the same browser
- [ ] At 375 one column, no horizontal scroll, the whole card is one tap target
- [ ] Light and dark at 1280 and 375: paper stays readable, the card border and muted line follow the theme
- [ ] A new blank document shows the title page until its first text is projected
- [ ] A long list (30 documents) scrolls smoothly; the network tab shows one `GET /api/documents` and no per-card request
- [ ] Block localStorage (private window with storage denied): the page opens in cards and the toggle still switches
