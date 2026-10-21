# Tester briefing: Documents and history

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## What changed

**G1, shared types and history library** (`libs/types`, `libs/history`)
- `libs/types/src/{documents,history,routes,http}.ts` — documents, sharing and history contracts, routes, copy constants, `HttpStatus`.
- `libs/history/src/{document-content,edit-windows,single-flight,edit-events,document-history,seed-docx,docx-signature}.ts` — the pure POC modules lifted; `edit-events.ts` now emits raw `ProjectedEdit` (`yjsClientIds` plus `connectionUserId`) and starts from state bytes; `findBootstrapSequence` returns `null` for an unbootstrapped room; `isDocx` checks the zip signature and `word/document.xml`.
- `libs/history/src/update-log.ts`, `schema/history.ts`, `migrations.ts`, `drizzle/history/` — the update log on better-sqlite3 with drizzle migrations; `compact` reads only the tail after the latest snapshot; `readBatch`, `hasUpdates`, `forget`.
- `libs/history/src/{read-model,projection,imported-revisions}.ts`, `schema/read-model.ts`, `drizzle/read-model/` — `edit_events` and `projection_cursor`, cursor-based idempotent `projectPending`, mapping of imported tracked changes.
- `libs/history/src/testing/**` — `openTestDatabase`, `writeStory`, `commitBootstrap`, exported as `@superdoc-collab/history/testing`.

**G2, server** (`apps/server`) — documents and sharing routes, the Hocuspocus membership check and read-only connections, the update log and the projection worker, `GET /api/documents/:id/events`. Details per task are in `plan.md` Tasks 5 to 9.

**G3, web** (`apps/web`) — documents list with upload, the SuperDoc editor page with members, share dialog, rename, download and delete, the share landing page.

**G4, e2e and docs**
- `e2e/{documents,collaboration}.spec.ts`, `e2e/editor.ts`, `e2e/fixtures.ts` (`signedInContext`), `playwright.config.ts` (timeout 120 s, `E2E_DATABASE_DIR`).
- `docker/Dockerfile` — the image carries `libs/history/drizzle` (both migration sets) next to `dist/`.
- `README.md`, `docs/features/README.md`.

## How to run

Unit and types:

```bash
pnpm typecheck
pnpm test:unit
```

E2E (builds and starts its own stack on port 3100; needs `pnpm exec playwright install chromium`):

```bash
pnpm test:e2e
```

Production-shaped server for the Playwright MCP walk, on port 3200 (SuperDoc only works from the built bundle):

```bash
export PORT=3200 APP_ORIGIN=http://127.0.0.1:3200 AUTH_SECRET=slice-two-test-secret-0123456789abcdef DATABASE_DIR=$(mktemp -d) TRUST_PROXY=false DEMO_PASSWORD=superdoc-demo WEB_DIST_DIR=apps/web/dist
pnpm build && node apps/server/dist/seed.js && node apps/server/dist/main.js
```

Docker on port 3000:

```bash
ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d
docker compose down -v
```

## Red today, green after

Each task committed its failing tests alone before the implementation; `git log --oneline main..HEAD` lists the pairs, and `git show --stat <sha>` of the `test(...)` commit plus a checkout of that commit is the red evidence.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/history/src/docx-signature.test.ts` | `./docx-signature` did not exist | `isDocx` checks the zip signature and `word/document.xml` |
| `libs/history/src/{edit-windows,single-flight}.test.ts` | the lifted modules were not in `libs/history` | modules lifted from the proof of concept's `lib` |
| `libs/history/src/{update-log,relay-attribution,snapshots}.test.ts` | `./migrations` and `./update-log` did not exist | update log on better-sqlite3 with drizzle migrations |
| `libs/history/src/{projection,imported-revisions}.test.ts` | `./projection` and `./imported-revisions` did not exist | read model, cursor and mapping implemented |
| `e2e/documents.spec.ts`, `e2e/collaboration.spec.ts` | no documents, sharing or history in the product | the slice is built; both specs pass twice in a row |

Counts today: types 7, history 30, web 61, server 140 unit tests; 18 E2E specs (7 auth, 2 collaboration, 9 documents).

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: a reader's keystrokes never reach the log. Break it by: open a read link, type in the editor, try keyboard shortcuts and paste, then read `/events` and the page text of the owner.
2. Hypothesis: a rotated link stops working but members stay. Break it by: accept a link, rotate it, open it with a third user, then check the first member can still open the document.
3. Hypothesis: events appear within about 5 s of typing. Break it by: type, poll `/events` and time the first event; type from two users at once.
4. Hypothesis: a non-member gets the same 404 body as a missing document on every document route and is refused on the socket. Break it by: call every route and open the collaboration socket as a user without membership.
5. Hypothesis: a `.docx` that is a renamed `.zip` without `word/document.xml` is refused with 415 and leaves no file and no row (Review focus 1). Break it by: upload it, then list documents and inspect `DATABASE_DIR/documents`.
6. Hypothesis: a share token for a deleted document shows "This link is no longer valid", never a 500 (Review focus 2). Break it by: delete, then open the link.
7. Hypothesis: two byte-identical uploads create two documents with distinct ids, each listed only for its owner (Review focus 3). Break it by: upload the same file as two users.
8. Hypothesis: an editor whose edit link was rotated keeps editing; a newcomer with the old link is refused; an editor accepting the read link is not downgraded (Review focus 4). Break it by: run those three paths in order.
9. Hypothesis: a projection that dies mid-batch resumes from the cursor without duplicating events (Review focus 5). Break it by: kill the server while typing, restart, and compare `/events` before and after.
10. Hypothesis (spike fact 1): awareness `userId` equals the authenticated user id, so identities are `declared`. Break it by: inspect `client_identities` in `history.sqlite` after two users type.
11. Hypothesis (spike fact 2): a joiner ignores the bytes it passes and loads the room state, so joiners work with `blank.docx`. Break it by: join a document whose text differs from the blank file and reload.
12. Hypothesis (spike fact 3): readers are enforced twice, by `connection.readOnly` on the server and `documentMode: 'viewing'` in SuperDoc. Break it by: send a Yjs update from a reader's socket directly.
13. Hypothesis (spike fact 4): better-sqlite3 binds a `Uint8Array` as is and stores identical bytes. Break it by: compare an uploaded update's bytes with the stored blob.
14. Hypothesis: the Docker image starts, migrates both history sets, creates `/data/documents` and carries the SDK's native binary. Break it by: the Docker commands above plus an upload with tracked changes.

## Known gaps

- No timeline and no time travel yet; slice 3.
- A role change needs a reconnect to take effect on an open socket.
- Imported revisions need the native `@superdoc/sdk` binary; without it the import fails and is logged as `IMPORT_FAILED_MESSAGE`, and the document shows no imported events.
- CSRF: Origin check on `/api/documents/*` and `/api/share-links/*` (hono/csrf); JSON mutations are additionally protected by the CORS preflight.
- In degraded projection mode, deleting a document leaves orphaned read-model rows.
- Imports share the projection queue with live projection, so a slow import delays the events of other documents until its timeout.
- `TRUST_PROXY=true` is only safe behind a proxy that overwrites `X-Forwarded-For`; the E2E stack sets it on purpose.
- Two `create` openers racing on a brand-new document is a documented limitation; the specs open the owner first.
