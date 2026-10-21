# Tester briefing: Public read-only link

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works. Steps 14 and 15 (visitors in the members row) are built on top of the merge of `ai-presence-avatar`.

## What changed

- `apps/server/drizzle/0009_public-link.sql`, `schema/documents.ts` — `documents.is_public`, default off.
- `apps/server/src/documents/public-link-routes.ts` — `GET|PUT /api/documents/:documentId/public`, owner only; switching off calls `PublicConnections.close`.
- `apps/server/src/public/public-routes.ts` — `GET /api/public/:documentId` (member pointer, visitor with identity and room token, one 404 for missing and private, 503 while the room is not committed) and `GET /api/public/:documentId/summary`; a per-address window on the whole router. Mounted in `http/app.ts` outside the session guard.
- `apps/server/src/collaboration/` — `authenticate-public.ts`, `public-room-tokens.ts` (own key label; `agent/room-tokens.ts` now exports `sealClaims` and `openClaims`), `public-connections.ts`, a fourth socket kind in `collaboration-server.ts`, the per-address admission window in `attach-collaboration.ts`, `CollaborationContext.visitor`.
- `apps/server/src/insights/insights-repository.ts` — `latestSelectionSummary`.
- `libs/types/src/public-link.ts` (and `routes.ts`, `constants.ts`, `http.ts`, `author-colors.ts`) — animals, viewers, the public payloads, paths, limits.
- `apps/web/src/features/sharing/` — `public-page.tsx`, `public-link-section.tsx` (inside the Share dialog), `public-api.ts`, `public-copy.ts`, `public-summary-card.tsx`, `animal-avatar.tsx`, `viewer-avatar.tsx`; route `/public/:documentId` in `app/router.tsx`.
- Sibling files touched, additive only: `apps/web/src/features/editor/superdoc-editor.tsx` (optional props `collaborationPath` and `collaborationToken`, `user` typed as `CollaborationUser`) and `superdoc-options.ts` (`collaborationToken` with the placeholder as default, `CollaborationUser`). Expect a trivial merge with `toolbar-ruler-mode-theme`.
- `e2e/public-link.spec.ts`.

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/public src/collaboration/public-socket.test.ts src/collaboration/public-socket-writes.test.ts src/collaboration/public-flag-off.test.ts src/collaboration/public-room-tokens.test.ts src/documents/public-link-routes.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/sharing
pnpm exec playwright test e2e/public-link.spec.ts
```

Walk by hand: sign in as Ana, upload a DOCX, open Share, switch `Anyone with the link can view`, copy the address, open it in a second browser with no session.

## How ids and the public URL ended up

The document id is `randomUUID()` (`store-document.ts`), 122 random bits, so `/public/<documentId>` uses it and no second slug exists. A guess of the id finds nothing: a missing id and a private document answer the same 404 body.

## Red today, green after

Failure texts are the ones the red runs printed.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `documents/public-link-routes.test.ts` (7 failed, 1 pin) | `isPublic is not implemented for <id>`; the switch route answered 404 | migration 0009, repository, owner routes |
| `libs/types/src/public-link.test.ts` (4) | `anonymousViewerOf is not implemented for visitor-1` | hash-derived animal and colour |
| `collaboration/public-room-tokens.test.ts` (6) | `signPublicRoomToken is not implemented for 1111...` | own key label, document and expiry bound |
| `insights/insights-repository.test.ts` (2 new) | `latestSelectionSummary is not implemented for <id>` | newest stored sentence query |
| `public/public-routes.test.ts` (6 failed, 3 pins) | `expected 404 to be 200` (no route) | visitor, member, 404, 503, 429 answers |
| `public/public-allowlist.test.ts` (2 failed, 7 pins) | `expected 404 to be 200` on the summary route | summary route; the pins hold the allowlist |
| `collaboration/public-socket.test.ts` (3 failed, 9 pins) | `The collaboration server refused the connection.`; no 101 and no 429 on upgrade | public socket kind and admission window |
| `collaboration/public-flag-off.test.ts` (1 failed, 2 pins) | `Test timed out in 20000ms` (no socket closed) | `PublicConnections.close` on switch off |
| `collaboration/public-socket-writes.test.ts` | pin: green on arrival, the guard landed with the admission | |
| `web/features/sharing/public-link-section.test.tsx` | `PublicLinkSection is not implemented for doc-1` | switch, link and copy |
| `web/features/sharing/public-page.test.tsx` | `PublicPage is not implemented` | page, redirect, notices, editor wiring |
| `web/features/sharing/public-page.test.tsx::a connection that fails after it synced asks for a new room token by itself` | `expected "vi.fn()" to be called 2 times, but got 1 times` (6798f48e), found by the E2E: a link switched off left a Reload banner | `243a02a1` |
| `e2e/public-link.spec.ts` (6 specs) | written against the implementation, no red run; one run by the developer: 6 passed in 32.7 s, after two fixes (the summary spec needed an edit in both topics; the switch-off spec found the bug above) | |

## Mutation checks (steps 7 and 8)

The tests of `public-socket-writes.test.ts` landed green because the guards came with the admission, so each guard was broken once and restored; the surviving test caught it each time.

| Mutation | Test that went red | Failure text |
|----------|--------------------|--------------|
| `isWriteAllowed` no longer refuses a visitor context | `... with the read-only flag lifted by mistake, an update from a public connection is still not appended to the log` | `expected [ Array(1) ] to deeply equal []` |
| the visitor's awareness frame is no longer silenced | `a visitor announces no awareness to the room while it sees the awareness of a member` | `expected true to be false` |
| `connection.readOnly` no longer set for the Reader role | `an update from a public connection is never applied to the room nor appended to the log` | `expected 'written by the ownerwritten by the vi…' to be 'written by the owner'` |

## Hypotheses to attack

1. A visitor can never write. Break it by: send a raw Yjs sync-update frame on `/collaboration/public` with the read-only flag lifted in the debugger, and with it set; check `updateLog` and the in-memory room. The unit test lifts the flag server-side and proves only the log stays clean (the room applies the update in memory then), so the read-only flag is the first wall and `isWriteAllowed` the second.
2. Nothing public starts model, projection or version work. Break it by: call every route under `/api` with no cookie and with a room token as bearer, watching the worker jobs and the fake model counters.
3. A missing id and a private id are indistinguishable. Break it by: compare status, body, headers and timing over many calls.
4. Turning the link off disconnects at once. Break it by: view on a slow link, switch off, watch the socket and the page; also switch off between the public GET and the socket open.
5. No email leaves the server in any public answer. Break it by: grep every response and websocket frame of the public page for `@`.
6. Awareness: a visitor has no caret. Break it by: click in the text as a visitor and look for a remote caret in the owner's editor.
7. The Share dialog switch does not break the existing dialog tests or the layout at 375 px.

## Developer runs

`pnpm typecheck` green; libs/types 84 tests, the server tests of `src/http`, `src/public`, `src/documents`, the public and collaboration files, `src/database` (398 tests) and the web tests of `features/sharing`, `features/editor` and `app` (487 tests) green; `tools/repository-shape` has one failure that is not this lane's: `feature-status.test.ts` finds the row of `imported-history-first-open` at Building while its spec says Shipped, in the base this branch was cut from (it resolves when `main` is merged). Prettier clean.

## Known gaps

- Visitors are polled every `MEMBERS_REFRESH_MS` (their awareness frames are silenced, so no awareness event refreshes the owner's row): a visitor shows up to 5 s late.
- `GET /api/public/:id/members` lists visitors with the real name of a signed-in non-member; that is by design (ADR 0050).
- The per-address windows keep one entry per address in memory (the helper is shared with the upload budget).
- Real rendering of the visitor view in SuperDoc (viewing mode, no toolbar, remote carets of editors) has only a stub in unit tests: the Playwright walk is the proof.

## Steps 14 and 15

Red commits: `test(public): visitors and online people...` (server: public members route 404, members answer without `visitors`) and `dc75fd2e` (web: avatar ignores the animal, no visitor in the row, no members row on the public page). Green: the server commit after the first and `9bf0b38c`. The animal avatar is folded into `UserAvatar` (`animal` prop, icons in `lib/animal-icons.ts`). E2E `the owner sees the visitor as an animal, the visitor sees the owner online and the owner caret`: 7 specs passed in 44.4 s; the caret of the owner is visible to the visitor (`REMOTE_CARET_SELECTOR`).
