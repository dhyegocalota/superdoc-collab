# Documents and history — test plan

Executed by the `tester` sub-agent after `tester-briefing.md` exists. Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: <commit | log path | count | screenshot path>`. A box that cannot run is marked `BLOCKED: <why>`, never ticked.

Environment for the Playwright MCP walk: `pnpm build && node apps/server/dist/seed.js && WEB_DIST_DIR=apps/web/dist DATABASE_DIR=<temp> PORT=3100 APP_ORIGIN=http://localhost:3100 TRUST_PROXY=true AUTH_SECRET=<32+ chars> DEMO_PASSWORD=superdoc-demo node apps/server/dist/main.js`. SuperDoc only works from the built bundle, never under `vite dev`. Demo users: `ana@`, `bruno@`, `caio@`, `dani@example.com`, password `superdoc-demo`. One browser context per user. Screenshots under `.pr-media/documents-and-history/`.

## The failing test first

- [ ] `libs/history/src/projection.test.ts::a rewound cursor re-projects without duplicates` exists in a commit before `projection.ts`; at that commit it fails with "Cannot find module './projection'", not with an assertion about counts
- [ ] `apps/server/src/collaboration/collaboration-history.test.ts::a reader's update is acknowledged but never logged` was red before `connection.readOnly` was set: on the commit that adds the test, `reader.id` appears in the logged `connectionUserId`s
- [ ] `apps/server/src/documents/documents-routes.test.ts::rejects a zip without word/document.xml` fails before `isDocx` is wired, with status 201 instead of 415

## Unit (`pnpm test:unit`)

- [ ] `pnpm typecheck` exits 0 for `libs/types`, `libs/history`, `apps/server`, `apps/web` and `e2e`
- [ ] `pnpm test:unit` runs `libs/types`, `libs/history`, `apps/server`, `apps/web`; zero failures, zero skipped; the counts per package are recorded
- [ ] `poc/` is unchanged: `git diff main...HEAD -- poc` prints nothing, and `pnpm --dir poc test:unit` still passes
- [ ] Ported POC suites in `libs/history`: `edit-windows` (5), `single-flight` (2), `relay-attribution` (4), `snapshots` (2) all pass against better-sqlite3
- [ ] `update-log.test.ts::binds a Uint8Array…` — input: one Yjs update appended without `Buffer.from`; expected: the read-back value's constructor is `Uint8Array` and its bytes equal the input
- [ ] `update-log.test.ts::compaction reads only the tail…` — input: 25 updates, `everyUpdates: 10`, then 5 more; expected: `[10, 20]`, then `[30]`
- [ ] `projection.test.ts::projects edits after the bootstrap with the raw identity facts` — input: `'Hello'` → `'Hello world'` by Ana's doc; expected: one stored event with `yjsClientIds: [ana.clientID]`, `connectionUserId: 'ana'`, no resolved author column
- [ ] `projection.test.ts` — input: a story written without `meta.bootstrapState = 'committed'`; expected: `projectPending` returns `null` and no event exists
- [ ] `projection.test.ts` — input: bootstrapped `['']`, seven writes, `batchSize: 3`; expected: inserted text `xxxxxxx`, cursor equals the last logged sequence
- [ ] `imported-revisions.test.ts` — input: the T10 insertion by "Ana Souza" dated `2026-03-01T18:30:00Z` in block `00000002`; expected: `{ revisionId: 'r1', authorName: 'Ana Souza', serverTime: Date.parse(date), blockId: '00000002', inserted: ' GDPR clause', deleted: '' }`
- [ ] `projection.test.ts::imported revisions are stored once…` — input: the same revision committed twice; expected: one event, `sequence: 0`, `authorIds: []`
- [ ] `libs/types` — input: `titleSchema` with `'   '`; expected: failure; input: `documentApiPath({ documentId: 'a/b' })`; expected: `/api/documents/a%2Fb`
- [ ] Edge: `imported-revisions.test.ts` — input: a deletion item with `deletedText: null`; expected: `MissingTrackedChangeTextError` naming the revision id
- [ ] Edge: `docx-signature.test.ts` — input: `%PDF-1.7` bytes and a zip truncated to 40 bytes; expected: `isDocx` false for both, no throw
- [ ] Edge: `room-name.test.ts` — input: `other/<uuid>`, `sd2/v2.1/<uuid>/x`, a bare uuid, `sd2/v2.1/probe`; expected: `null` for each, and the uuid for `sd2/v2.1/<uuid>`
- [ ] Edge: `local-disk-file-storage.test.ts` — input: `pathOf('../auth')`; expected: `InvalidDocumentIdError`
- [ ] Edge: `documents-repository.test.ts::grant upgrades a role and never downgrades it` — input: reader → editor → reader, and the owner granted reader; expected: Bruno editor, Ana owner
- [ ] Web: `upload-dialog.test.tsx` — input: a 10 MB + 1 byte `.docx`; expected: `role="alert"` shows "Files up to 10 MB can be uploaded." and `fetch` was never called
- [ ] Web: `editor-header.test.tsx` — input: role reader; expected: "Read only" visible, no Delete and no Share button, the title is a heading, not an input
- [ ] Web: `share-landing-page.test.tsx` — input: accept returns 404; expected: "This link is no longer valid" and a link to `/documents`; under StrictMode exactly one POST
- [ ] Web: `documents-page.test.tsx` — input: `{ mine: [], shared: [] }`; expected: "No documents yet" and "Nothing shared with you yet"; input: one row; expected: title, owner name, a formatted date and the role
- [ ] Web: `share-dialog.test.tsx` — input: Rotate on the edit row; expected: one POST to `…/share-links/edit/rotate` and the new URL replaces the old one, the read URL unchanged
- [ ] Scheduler: `projection-scheduler.test.ts::scheduling a busy document coalesces into one rerun` — input: five `schedule` calls before the first reply; expected: exactly two `Project` messages posted

## Integration (real HTTP and socket, Vitest)

- [ ] Upload a valid `.docx` → 201 with `title` from the file name; `GET /api/documents` lists it under `mine`; `GET …/download` returns byte-identical content with `content-type` the DOCX mime
- [ ] A renamed `.zip` without `word/document.xml` → 415 `{ error: "Only .docx files can be uploaded." }`; `mine` is empty; `DATABASE_DIR/documents` holds no file
- [ ] A 12 MB body → 413 before parsing; a file of exactly 10 MB of zeros → 415, not 413; a valid docx sent as `text/plain` → 415
- [ ] Two users upload the same bytes → two different ids; each user's `mine` holds only their own
- [ ] Non-member on `GET`, `PATCH`, `DELETE`, `/download`, `/members`, `/events`, `/share-links` → 404 with a body identical to a random uuid's 404
- [ ] Reader `PATCH` → 403; editor `PATCH { title: "  New  " }` → 200 with `title: "New"`; `PATCH { title: "" }` → 400
- [ ] `GET /api/documents/:id` → `roomMode: "create"` on a fresh document, `"join"` once the log holds one update
- [ ] Socket: a non-member's provider gets `onAuthenticationFailed`; a reader's insert is never logged while the owner's is; a server restarted on the same `DATABASE_DIR` restores the room text
- [ ] Awareness `userId` equal to the socket user → `client_identities.source = 'declared'`; a different `userId` → stays `observed`
- [ ] `history-routes.test.ts::a late declaration corrects the author of an already projected edit` — input: the owner's socket relays Ana's offline struct, `/events` shows the owner; then Ana connects and declares her `userId`; expected: the same event (same id, no re-projection) now lists `authors: [{ id: ana }]`
- [ ] Two authors (owner, editor) write `' A'` then `' B'` → `/events` attributes `' A'` to the owner and `' B'` to the editor within 15 s
- [ ] Imported revision: upload a seed with an insertion by "Chris Crawford" → `/events` returns one event `{ imported: true, authors: [{ id: null, name: "Chris Crawford" }], inserted: " developers", sequence: 0 }` within 30 s
- [ ] Worker crash: terminate `scheduler.currentWorker` mid-projection → a new worker exists and the 50 edits are projected once (joined `inserted` is exactly 50 `y`)
- [ ] `?afterSequence=-1` → 400; `?afterSequence=<n>` → only events with `sequence > n`
- [ ] Share links: owner GET twice → the same two URLs; rotate edit → a new edit URL, the read URL unchanged; the old edit token → 404 `{ error: "This link is no longer valid" }`; an editor who accepts the read link stays editor
- [ ] A token for a deleted document → 404 with the invalid-link body; accept without a session → 401
- [ ] A reader who accepts the edit link → `findRole` returns editor; the owner who accepts their own read link stays owner
- [ ] `GET …/share-links` as an editor → 403; as a non-member → 404; `POST …/share-links/owner/rotate` → 400
- [ ] Download of a document titled `Q3 "final" plan` → `content-disposition` carries `filename*=UTF-8''Q3%20%22final%22%20plan.docx` and no raw quote breaks the header
- [ ] The slice 1 socket guards still hold: an upgrade from a foreign `Origin` is destroyed; a socket that never authenticates is closed within 12 s
- [ ] Delete while the owner's provider is connected → 204; the provider receives a close; `GET` → 404; the file, the log rows (`hasUpdates` false) and the read-model cursor are gone
- [ ] `GET …/members` with the owner connected → the owner `online: true`, a disconnected editor `online: false`; signed out → 401
- [ ] A blank document (`POST { title: "Notes" }`) → 201; its download passes `isDocx`; its first open returns `roomMode: "create"`
- [ ] Restart with the same `DATABASE_DIR` after events exist → `/events` returns the same events (same ids) and new edits continue from the stored cursor without duplicates
- [ ] Timing: an edit appears in `/events` within 5 s of the update being logged (2 s store debounce plus projection), measured on the two-author test
- [ ] `pnpm --filter @superdoc-history/server build` produces `dist/main.js`, `dist/seed.js` and `dist/projection-worker.js`; `node apps/server/dist/main.js` starts and creates `auth.sqlite`, `history.sqlite`, `read-model.sqlite` in `DATABASE_DIR`

## E2E (Playwright specs, `pnpm test:e2e`)

- [ ] `upload, open, type and the events attribute the text to me` passes; `/events` shows `' <MINE>'` inserted by the signed-in user
- [ ] `two authors converge and each marker is attributed to its author` passes: both pages reach the same text of the expected length; `insertedBy` returns each author's marker; inserted minus deleted equals the length change
- [ ] `identities are declared from awareness` passes: every identity row for Ana's and Bruno's clients is `declared`
- [ ] `a reader cannot type but sees live edits` passes: the editor's `<AFTER>` appears on the reader's page without reload; `READER` never appears on the reader's page, the editor's page or in `/events`; "Read only" is visible
- [ ] `a share link adds the document to Shared with me`, `an invalid share link says so`, `rename persists after reload`, `delete removes the document for everyone` pass
- [ ] The whole suite passes twice in a row with `retries: 0`, slice 1 specs included

## Prove it for real — Playwright MCP

- [ ] Happy path: Ana signs in → `/documents` shows "No documents yet" in Mine and "Nothing shared with you yet" in Shared with me → Upload `.docx` → lands on `/documents/<id>` with the title from the file, SuperDoc rendering the content, the timeline panel saying "The timeline arrives in the next release" — screenshots `01-empty-list.png`, `02-editor.png`
- [ ] New document: "New document" → editor opens on "Untitled document", typing works; back on the list it shows under Mine with role owner
- [ ] Share: Ana opens Share → two URLs; Copy shows "Link copied"; in Bruno's context the edit URL lands on the document; Bruno's list shows it under Shared with me, role editor — `03-share-dialog.png`
- [ ] Two authors at once: Ana and Bruno type in different paragraphs; both see each other's text live; each sees the other's online dot in the header — `04-two-authors.png`
- [ ] Reader: Caio opens the read URL → "Read only" badge, no Share, no Delete; typing changes nothing on Caio's page or Ana's, while Ana's next sentence appears on Caio's page live — `05-reader.png`
- [ ] Events: in Ana's context `fetch('/api/documents/<id>/events')` lists Ana's and Bruno's inserted text with their names; Caio has none
- [ ] Empty: a user with no documents and no shares → both empty states, no table header row, the two buttons visible
- [ ] Single: one uploaded document → one row in Mine, Shared with me still empty
- [ ] Many: 12 documents (uploads and blanks) across Ana and Bruno → Mine ordered by last update, newest first; editing one moves it to the top after reload
- [ ] Rejected input: a `.pdf` and an 11 MB `.docx` in the upload dialog → the exact messages "Only .docx files can be uploaded." and "Files up to 10 MB can be uploaded."; the list is unchanged; no request for the 11 MB file in the network log
- [ ] Rotate: Ana rotates the edit link; Dani opens the old URL → "This link is no longer valid" with a link to `/documents`; Bruno still edits
- [ ] Rename: Bruno renames the title → Ana's list shows the new title after reload
- [ ] Browser Back mid-flow: from the editor press Back → `/documents` with the list intact; Forward → the editor reconnects and shows the same text
- [ ] Reload mid-flow: reload the editor while Bruno types → the text after reload contains everything typed before the reload
- [ ] Delete while others are connected: Ana deletes; Bruno's next reload shows "This document is no longer available"; the document is gone from both lists
- [ ] Download `.docx` → a file named `<title>.docx` that opens as a DOCX (zip with `word/document.xml`)
- [ ] Latency / disconnect: throttle Bruno to Slow 3G, type, restore → Ana sees Bruno's text after recovery; `/events` attributes it to Bruno
- [ ] Console and network clean: zero console errors across the walk; every `/api/*` call 2xx except the deliberate 404, 413 and 415
- [ ] Desktop 1280 px: list tables and editor header on one line, editor fills the width beside the panel — `06-desktop.png`
- [ ] Narrow 375 px: no horizontal page scroll on `/documents` (`scrollWidth <= 375`), tables scroll inside their container, the timeline panel is collapsed, header buttons reachable — `07-narrow.png`
- [ ] Docker: `docker compose up --build -d` → health ok within 60 s; sign in, upload, open the editor at `http://localhost:3000/documents/<id>`, type; `docker compose restart` → the text and `/events` survive; `docker compose down -v` leaves nothing running
- [ ] Video `walkthrough.mp4` and `walkthrough.gif` by the `recorder`: upload → share → two authors → reader → delete

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and asks the owning developer for a regression test.

## Adversarial review

The `reviewer` refutes the three claims most likely to be wrong:

- [ ] Claim "a reader can never change the room" — attack: a reader's raw provider (`connectToDocument` with the reader's cookie) sends an update on a room name with a different prefix (`other/<id>`) and on the canonical one; result: both refused or ignored, `onChange` never logs the reader — result: <refuted | held>
- [ ] Claim "events are attributed to the right author" — attack: an editor relays Ana's offline edit (POC relay scenario through two providers); compare `/events` authors with the declared identities; a single-author event naming the relayer is a finding — result: <refuted | held>
- [ ] Claim "a share token cannot be recovered from the database" — attack: read `document_share_links` and try to match any URL the owner sees; only `nonce` and `token_hash` must be present and neither equals the token; grep server logs and every response of the E2E run for a token — result: <refuted | held>

## Coverage honesty

- Activity aggregates, timeline, time travel and LLM summaries: slices 3 and 4.
- A role change while connected needs a reconnect (spike fact 3): an upgraded reader keeps `readOnly` until reload.
- Two people opening a brand-new document in the same instant can both get `create`; one fails to connect (`'create' never joins an existing room`) and succeeds on reload.
- SDK import failure is covered by code (logged once per document) but not by a test: no fixture reliably breaks the native SDK while staying a valid DOCX.
- Formatting-only edits, tables, headers, footers and comments are not projected (POC limits).
- Multi-instance servers and chaos (proxy cuts, server SIGKILL) are out of scope here; the POC proved them and slice 3 brings them back.
