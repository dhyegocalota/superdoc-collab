# Documents and history

**Status:** Approved
**Tier:** 🔴
**Owner approval:** approved 2026-10-16
**ADRs:** [0001](../../adr/0001-event-sourcing-over-yjs.md) history capture · [0002](../../adr/0002-authorship-observed-vs-declared.md) authorship · [0004](../../adr/0004-stack.md) stack · [0007](../../adr/0007-read-model-in-sqlite.md) read model · [0009](../../adr/0009-design-system.md) design system · [0010](../../adr/0010-documents-ownership-and-share-links.md) documents and sharing
**Not changing:** authentication and the socket cookie flow from slice 1; `poc/` stays untouched and green; no timeline UI, no time travel, no LLM (slices 3 and 4); no deployment (slice 5).

## Problem

Slice 1 ends on an empty workspace. The product is about watching a collaborative DOCX evolve, so this slice has to make documents exist: get a DOCX in, open it in SuperDoc with several people editing live, and record every edit with its author in a form the timeline can query cheaply. The proof of concept already proved the capture; this slice turns it into product code behind real ownership and sharing.

## Goals

1. **Documents list** at `/documents`: "Mine" and "Shared with me" tables (title, owner, updated, my role), with **New document** (blank) and **Upload .docx** (10 MB limit). Empty states for both tables.
2. **Editor page** at `/documents/:id`: header (editable title, members with an online dot, read-only badge, Share, Download .docx, Delete for the owner), SuperDoc filling the width, and a collapsible right panel reserved for the timeline ("The timeline arrives in the next release").
3. **Sharing**: Share dialog with two links (edit, read-only), each with Copy and Rotate; `/share/:token` records membership and redirects to the document; readers join the room read-only.
4. **Live collaboration** through the slice 1 socket: `onAuthenticate` now also checks membership for the `documentName` and sets `connection.readOnly` for readers.
5. **History capture** ported from the POC into `libs/history`: append-only Yjs update log, observed/declared identity, snapshot + tail restore, imported Word revisions from the uploaded DOCX (`@superdoc/sdk`).
6. **Read model** (ADR 0007): a worker thread projects new updates into `edit_events` (who, when, block, inserted, deleted, kind, imported) with a per-document cursor; `GET /api/documents/:id/events` serves it. Activity aggregates wait for slice 3, when the chart decides their shape.
7. **Spike first** (task 0, a day at most): confirm four vendor facts the plan depends on (below). Its result is recorded in `spike.md`; a failure narrows this spec rather than being worked around silently.

## Non-goals

Timeline, streamgraph, filters, time travel (slice 3); LLM summaries (slice 4); email invitations, organisations, comments, formatting-only history, tables/headers/footers in history, multi-instance servers, PDF.

## Design

### Layout and why

```
libs/history/           pure: update-log (better-sqlite3), document-content, edit-events, edit-windows,
                        document-history, single-flight, imported-revisions, projection
apps/server/src/
  documents/            documents.repository, documents.service, share-links, file-storage (interface + local-disk adapter), routes
  collaboration/        collaboration-server (hooks from the POC + membership + readOnly), attach-collaboration (unchanged)
  history/              history.routes, projection.worker (worker_threads, own read-only connection), projection.scheduler
  database/schema/      documents.ts, history.ts (drizzle schemas + migrations)
apps/web/src/
  features/documents/   documents-page, document-table, upload-dialog, new-document-button
  features/editor/      document-page, superdoc-editor, editor-header, members, share-dialog, timeline-panel-placeholder
  features/sharing/     share-landing-page (/share/:token)
e2e/                    documents.spec.ts, collaboration.spec.ts (two authors, attribution), fixtures (per-author contexts)
```

- `libs/history` holds everything that is pure and testable without a server; the POC files lift unchanged except `update-log.ts` (driver swap) and `seed-docx.ts` (enum for the change kind).
- File storage is an interface with one adapter (ADR 0010), so the only `fs` calls for documents live in `local-disk-file-storage.ts`.
- The projection runs in a worker because Yjs decoding is CPU (ADR 0003 benchmark); it opens its own better-sqlite3 connection, read-only on the log, read-write on the read model. Only bytes and JSON cross the thread boundary.

### Data flow

```
upload .docx ──► POST /api/documents (multipart, ≤10 MB, zip signature + mime checked)
              ──► file-storage.put ─► documents row (owner) ─► imported-revisions worker (sdk trackChanges.list → edit_events imported=true)
new blank     ──► POST /api/documents { title } ─► documents row, no file
open          ──► GET /api/documents/:id → { document, role, roomMode }   (roomMode decided server-side: 'create' until the log has a committed bootstrap)
              ──► SuperDoc v2Collaboration { providerType: 'hocuspocus', serverUrl: same origin /collaboration, documentId, roomMode, token: placeholder }
socket        ──► onAuthenticate: cookie → session → membership(documentName) → { userId, role }; reader → connection.readOnly = true
              ──► onLoadDocument: materialize(log) ; onChange: log.append ; onAwarenessUpdate: declare identities ; onStoreDocument: snapshots + schedule projection
projection    ──► worker: read updates after cursor → projectEditEvents → insert edit_events → advance cursor (idempotent, single-flight per document)
read          ──► GET /api/documents/:id/events?afterSequence= → edit events with author { id, name } ; GET /api/documents/:id/download → file-storage.get
share         ──► POST /api/documents/:id/share-links/:role/rotate ; GET /share/:token → membership upsert → redirect /documents/:id
```

### Interfaces

- `GET /api/documents` → `{ mine: DocumentSummary[], shared: DocumentSummary[] }`
- `POST /api/documents` (multipart `file` or JSON `{ title }`) → `DocumentSummary` · 413 over 10 MB · 415 not a DOCX
- `GET /api/documents/:id` → `{ document, role, roomMode }` · 404 when not a member (same body as a missing document)
- `PATCH /api/documents/:id` `{ title }` (owner or editor) · `DELETE /api/documents/:id` (owner; removes rows, file, room state and history)
- `GET /api/documents/:id/download` → the stored file (owner, editor, reader)
- `GET /api/documents/:id/share-links` (owner) → `{ edit: url, read: url }` · `POST …/share-links/:role/rotate` (owner)
- `GET /share/:token` (web route; calls `POST /api/share-links/:token/accept`) → membership with the link's role, then redirect
- `GET /api/documents/:id/events?afterSequence=N` → `{ events: EditEvent[], cursor }` (member)
- `GET /api/documents/:id/members` → `{ members: { user, role, online }[] }` (online from the room's awareness states)
- Enums in `libs/types`: `DocumentRole { Owner, Editor, Reader }`, `RoomMode { Create, Join }`, `BlockChangeKind` (from the POC), `ShareLinkRole { Edit, Read }`.

### Spike (task 0) — facts to confirm before building

| Fact | Why it matters | If false |
|---|---|---|
| SuperDoc sets awareness `userId` from `user.id` (or lets us set it) | declared identity needs awareness `userId === socket userId` | pass the user id in `user.email`'s place only for awareness, or declare identities from the socket's `clients` without the awareness match (weaker; record it) |
| `join` mode ignores document bytes | otherwise every joiner must fetch the file | keep sending the file for joiners |
| SuperDoc honours a read-only connection (no local edits, or edits refused) | reader role | hide the editor chrome for readers and show read-only state ourselves; the server still refuses updates |
| better-sqlite3 binds `Uint8Array` directly | update log append | `Buffer.from(update)` |

### Failure handling

| Failure | Behaviour |
|---|---|
| Upload over 10 MB | 413 before the body is buffered; the dialog shows the limit |
| Not a DOCX (wrong zip signature or missing `word/document.xml`) | 415; file never stored |
| Non-member opens a document or socket | 404 on HTTP (indistinguishable from missing); socket rejected like slice 1 |
| Reader sends an update | Hocuspocus acks without applying; `onChange` never fires; the editor shows the read-only badge |
| Share token unknown or rotated | `/share/:token` shows "This link is no longer valid" and a link to `/documents` |
| Projection worker crashes | scheduler restarts it; the cursor makes re-projection idempotent; `/events` serves what exists |
| SDK import of tracked changes fails | document still opens; `imported` events absent; error logged once per document |
| Delete while others are connected | room destroyed, their provider receives close; next load is 404 |

### Security

Every document route checks membership through one `requireDocumentRole({ documentId, userId, minimumRole })`. Share tokens are 32 random bytes, stored as SHA-256, compared in constant time, never logged. Downloads send the stored file by document id, never a client-supplied path. The `Origin` check and the cookie flow from slice 1 stay; `onAuthenticate` now receives `documentName` and refuses rooms the user is not a member of with the same generic error.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| How a document enters | upload · blank · both | both | 2026-10-16 |
| Visibility | single workspace · owner + email invites · owner + share link | owner + share link | 2026-10-16 |
| Share link permission | two links (edit, read) · one link always edit · one link with owner-set role | two links | 2026-10-16 |
| Read model now | worker-fed SQLite read model · project on demand with cache | worker-fed read model (ADR 0007 accepted) | 2026-10-16 |
| File storage | disk on the data volume · SQLite blob · discard original | disk, behind a `DocumentFileStorage` interface (dependency inversion) | 2026-10-16 |
| Layout | table + editor with reserved side panel · cards + full-screen editor · table + bottom panel | table + editor with reserved side panel | 2026-10-16 |
| Imported Word revisions in this slice | now · slice 3 | **decided by the advisor, owner can override:** now — it is part of "history capture" (ADR 0001) and the SDK path was proven in the POC (T10); cost is the native SDK binary in the image | 2026-10-16 |
| Delete document | owner can delete · no delete | **decided by the advisor:** owner can delete; a demo without delete leaves junk documents around | 2026-10-16 |
| Activity aggregates (`activity_buckets`) | now · slice 3 | **decided by the advisor:** slice 3, when the chart fixes bucket size and topic dimension; `edit_events` is enough for every query until then | 2026-10-16 |

## Test strategy summary

- Unit (`libs/history`, Vitest): the POC unit suites ported (windows, single-flight, relay attribution, snapshots) plus `update-log` on better-sqlite3 and the projection cursor (idempotent re-run, resume after crash).
- Integration (server, real HTTP + socket): membership on every route (404 for non-members), upload limits and signatures, share-link accept/rotate, reader socket is read-only (`onChange` never fires), two authors' updates logged with the right `connectionUserId`, projection produces attributed events, download returns the original bytes, delete removes everything.
- E2E (Playwright): upload → open → type → events attribute to me; two signed-in contexts typing in one document converge and `/events` attributes each marker to its author (port of POC T1/T2 assertions); reader context cannot type; share link flow; title rename; delete.
- Playwright MCP walk (tester): the whole flow from sign-in to a shared edit session, the read-only badge, 375 px, console and network clean; chaos is out of scope here (the POC proved it) and returns in slice 3's test plan where the timeline depends on it.
- Spike report in `spike.md` with the four facts and evidence.
