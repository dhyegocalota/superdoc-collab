# Documents and history — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Author this list with every box empty. A sub-agent ticks its own line with evidence. A wrong step is struck through with the reason, not deleted.

**Spec:** [spec.md](spec.md) · **Spike:** [spike.md](spike.md)
**Tier:** 🔴
**Goal:** Documents exist: upload or create a DOCX, open it in SuperDoc with several people editing live behind owner + share-link membership, and record every edit with its author in a read model served by `GET /api/documents/:id/events`.
**Architecture:** `libs/history` holds the POC's pure history code ported to better-sqlite3 (update log, projection, read model) with its own drizzle schemas and migrations. `apps/server` owns three SQLite connections (`auth.sqlite`, which now also holds documents, members and share links; `history.sqlite`; `read-model.sqlite`), the documents and sharing routes, the Hocuspocus hooks and one `node:worker_threads` projection worker, which is the only writer of the read model. `apps/web` adds the documents list, the SuperDoc editor page and the share landing page.
**Tech stack:** slice 1 stack plus superdoc 2.23.0, @hocuspocus/provider 2.15.3, yjs 13.6.33 in `apps/web`; @superdoc/sdk 2.20.0 in `apps/server`; diff 8.x and jszip 3.x in `libs/history` (exact versions pinned by `--save-exact` at install).
**Seam:** `onAuthenticate` in `apps/server/src/collaboration/collaboration-server.ts` gains the membership check; `startServer` gains the history connections and the worker; `router.tsx` replaces the slice 1 empty documents page.
**Assumptions (decided, owner can override):**
- The history key is the **document id**: the room name becomes a document id once (`documentIdFromRoomName`), and every log, snapshot, identity, event and cursor row is keyed by it, so delete and projection never need the room name.
- A blank document is stored as a generated one-empty-paragraph DOCX (`buildSeedDocx`), so every document has a file, `create` always has real bytes and Download always works; jszip is therefore a runtime dependency of `libs/history`.
- Joiners pass a static blank DOCX (`apps/web/public/blank.docx`) as `data`: spike fact 2 shows `join` ignores the bytes but refuses an empty blob.
- Share URLs must be shown again while only a hash is stored: a link row keeps a 32-byte random `nonce` and `sha256(token)`; the token is `base64url(HMAC-SHA256(AUTH_SECRET, nonce))`. Rotate replaces the nonce.
- `edit_events` stores raw facts, not authors: `yjs_client_ids` (JSON array) and `connection_user_id` of the update that produced the event. The `/events` route resolves authors at read time with the POC's `resolveAuthorIds` over the current `client_identities`, so a declaration that arrives after projection still corrects the author (ADR 0002). An event can have several authors (a relayed update). Imported rows store null client ids and connection user plus a non-null `author_name`.
- A membership role is what was recorded at accept time; a stronger link upgrades, never downgrades; rotation only invalidates the link.
- `roomMode` is `join` only once the log holds a committed bootstrap (`findBootstrapSequence` finds `meta.bootstrapState === 'committed'`, spec Data flow), `create` otherwise. Only the owner and editors may create: a reader opening a document whose room was never created gets 409 `{ error: DOCUMENT_NOT_READY_ERROR }` and the page says "The owner has not opened this document yet." SuperDoc documents that `'create' never joins an existing room`, so a late creator fails to connect instead of resetting the room.
- Online presence comes from the room's authenticated connections (`connection.context.userId`), not from client-declared awareness.
- File names follow the repo's kebab-case (`documents-repository.ts`), not the spec layout's dotted names.

## Global constraints

- Everything in English. No comments. No `?? default`. No `else`. Enums over string literals. Constants over magic literals. Named parameters when a function takes more than one. Function declarations. No `.js` in imports. No `sleep` in tests: wait on conditions.
- Versions pinned exactly: `superdoc` 2.23.0, `@hocuspocus/provider` 2.15.3, `yjs` 13.6.33, `@superdoc/sdk` 2.20.0, `@hocuspocus/server` 2.15.3.
- Every new table comes from a drizzle-kit migration; SQLite runs `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`; the `updates_by_document (document_name, sequence)` index stays.
- Uploads: 10 MB; 413 before the body is buffered; not a zip with `word/document.xml` and the DOCX mime → 415, never stored.
- Non-members get 404 with the same body as a missing document on every document route; the socket refuses them with the slice 1 generic error.
- Readers are enforced twice: `connection.readOnly = true` on the server and `documentMode: 'viewing'` in SuperDoc (spike fact 3).
- Share tokens never appear in logs, nor in responses other than the owner's share-links response.
- `poc/` stays untouched and green. One projection worker per process, no Piscina.

## Review focus

1. A `.docx` that is a renamed `.zip` without `word/document.xml` is refused with 415 and leaves no file and no row (Task 8: `rejects a zip without word/document.xml`).
2. A share token whose document was deleted shows "This link is no longer valid", never a 500 or a membership to nothing (Task 9: `a token for a deleted document is no longer valid`).
3. Two users uploading byte-identical files get two documents with distinct ids, each listed only for its owner (Task 8: `two uploads of the same file create two documents`).
4. An editor whose edit link was rotated keeps editing; a newcomer with the old link is refused; an editor accepting the read link is not downgraded (Task 9: `rotation invalidates the link but keeps recorded roles`).
5. A projection that dies mid-batch resumes from the cursor without duplicating events (Task 4: `a rewound cursor re-projects without duplicates`; Task 7: `a terminated worker is restarted and completes without duplicates`).

## File map

| Group | Owner | Paths |
|---|---|---|
| G1 shared types, history library, dependencies | developer A | `libs/types/**`, `libs/history/**`, root `package.json`, `pnpm-lock.yaml`, and the dependency blocks of `apps/server/package.json` and `apps/web/package.json` (Task 1 only) |
| G2 server | developer B | `apps/server/**` except the dependency blocks: `src/{documents,database,http,collaboration,history,testing}/**`, `src/server.ts`, `drizzle/**`, `tsup.config.ts`, `drizzle.config.ts` |
| G3 web | developer C | `apps/web/**` except its dependency block |
| G4 e2e + docs | developer A | `e2e/**`, `playwright.config.ts`, `docker/**`, `README.md`, `docs/features/documents-and-history/tester-briefing.md`, `docs/features/README.md` |

Every G2 task (5–9) modifies `apps/server/src/server.ts`, `apps/server/src/http/app.ts` and `apps/server/src/testing/test-server.ts`; one developer owns them in order, so there is no shared-file conflict.

## Sequencing

Task 0 is done: all four spike facts held and the plan is written for them, with no conditional steps. Task 1 first: it lands every dependency of the slice with one `pnpm install` and the shared contracts; no later task runs `pnpm add`. Then:
- A: Tasks 2 → 3 → 4, then Task 12 (after B and C) → 13.
- C (web): starts right after Task 1; Tasks 10 → 11 against the Task 1 contracts.
- B (server): starts after Task 3, because Task 5 needs `MigrationSet`, `HISTORY_MIGRATIONS_PATH` and `runMigrationSet`; then Task 5 → 6 → 7 → 8 → 9, strictly in that order, while A builds Task 4 in parallel. Task 7 waits for Task 4 (`ReadModel`, `projectPending`). The server is one group on one developer: the document routes (Task 8) need the runtime Task 7 builds, and every server task edits `server.ts`, `http/app.ts` and `testing/test-server.ts`.

Red first, per HARNESS → Build: every task from 1 to 11 commits its failing tests alone in a `test(<scope>): …` commit before the implementation commit, so the red state is provable with `git show <sha>`.

Then Z.

---

### Task 0: Spike (done)

- [x] **Step 1:** Read `spike.md` (commit 735a927). All four facts held and the plan below is written for them, with no open branches: the web passes `user: { id, name, email }` and the server declares a client when the awareness `userId` equals `context.userId` (Task 6, Task 11); joiners pass a valid blank DOCX, never the real file and never an empty blob, and `create` passes the stored file (Task 11); readers get `connection.readOnly = true` and `documentMode: 'viewing'`, and the read-only badge comes from our `role` (Task 6, Task 11); the update log binds `Uint8Array` as is and reads with `new Uint8Array(row.update_bytes)` (Task 3). Each fact keeps a regression test: Task 3 `binds a Uint8Array as is and stores identical bytes`, Task 6 `an awareness userId equal to the socket user declares the identity`, Task 12 `identities are declared from awareness` and `a reader cannot type but sees live edits`. — evidence: spike.md, commit 735a927

---

### Task 1: Shared enums, constants and API types (G1)

**Files:**
- Create: `libs/types/src/documents.ts`, `libs/types/src/history.ts`, `libs/history/{package.json,tsconfig.json,vitest.config.ts}`, `libs/history/src/index.ts` (empty until Task 2)
- Modify: `libs/types/src/routes.ts`, `libs/types/src/http.ts`, `libs/types/src/index.ts`, `package.json` (root), `apps/server/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`
- Test: `libs/types/src/documents.test.ts`

**Interfaces:**
- Produces: `DocumentRole`, `ShareLinkRole`, `RoomMode`, `BlockChangeKind`, `DOCUMENT_ROLE_RANK`, `SHARE_LINK_GRANTS`, `MAX_UPLOAD_BYTES`, `MAX_UPLOAD_MEGABYTES`, `DOCX_MIME_TYPE`, `DOCX_EXTENSION`, `UPLOAD_FIELD`, `UPLOAD_TOO_LARGE_MESSAGE`, `NOT_A_DOCX_MESSAGE`, `INVALID_SHARE_LINK_MESSAGE`, `TIMELINE_PLACEHOLDER_MESSAGE`, `UNTITLED_DOCUMENT_TITLE`, `COLLABORATION_TOKEN_PLACEHOLDER`, `DOCUMENT_NOT_READY_ERROR`, `DOCUMENT_NOT_READY_MESSAGE`, `DOCUMENT_UNAVAILABLE_MESSAGE`, `READ_ONLY_BADGE_LABEL`, `LINK_COPIED_MESSAGE`, `titleSchema`; types `UserReference`, `DocumentSummary`, `DocumentsList`, `OpenedDocument`, `DocumentMember`, `DocumentMembers`, `ShareLinks`, `AcceptedShareLink`, `EventAuthor`, `DocumentEditEvent`, `DocumentEditEvents`; `AppRoute.Document`, `AppRoute.Share`, `ApiPath.Documents`, `ApiPath.ShareLinks`, `DocumentResource`, `documentPagePath(documentId)`, `documentApiPath({ documentId, resource? })`, `shareLinkAcceptPath(token)`; `HttpStatus.Created | NoContent | Forbidden | Conflict | PayloadTooLarge | UnsupportedMediaType`; `HttpMethod`; the package `@superdoc-history/history` (empty) and every dependency of the slice, installed.

- [ ] **Step 0: Dependencies, one install** — resolve the two floating majors once: `pnpm view diff@^8 version | tail -1` and `pnpm view jszip@^3 version | tail -1`, and pin what they print, exactly. Then write, all exact:
  - `libs/history/package.json`: name `@superdoc-history/history`, `"type": "module"`, `"exports": { ".": "./src/index.ts", "./testing": "./src/testing/index.ts" }`, scripts `typecheck: tsc --noEmit`, `test:unit: vitest run`, `generate: drizzle-kit generate --config drizzle.history.config.ts && drizzle-kit generate --config drizzle.read-model.config.ts`; dependencies `@superdoc-history/types workspace:*`, `better-sqlite3 13.0.3`, `drizzle-orm 0.45.4`, `yjs 13.6.33`, `diff <resolved 8.x>`, `jszip <resolved 3.x>`; devDependencies `@types/better-sqlite3 9.6.0`, `drizzle-kit 0.31.11`, `tsx 4.23.15`, `vitest 5.0.5` (`diff` 8 ships its own types, so no `@types/diff`; add it only if `tsc` reports a missing declaration). `tsconfig.json` and `vitest.config.ts` copy `libs/types`'s.
  - `apps/server/package.json` dependencies: `@superdoc-history/history workspace:*`, `@superdoc/sdk 2.20.0`; devDependencies: `jszip <resolved 3.x>`.
  - `apps/web/package.json` dependencies: `superdoc 2.23.0`, `@hocuspocus/provider 2.15.3`, `yjs 13.6.33`.
  - root `package.json` devDependencies: `better-sqlite3 13.0.3`, `@types/better-sqlite3 9.6.0` (the E2E identity check reads `history.sqlite`).
  Run `pnpm install` once; `pnpm-lock.yaml` changes in this task only.
- [ ] **Step 1: Failing test** — `libs/types/src/documents.test.ts`
```ts
describe('documents contracts', () => {
  test('ranks owner above editor above reader and maps links to roles', () => {
    expect([DocumentRole.Reader, DocumentRole.Editor, DocumentRole.Owner].map((role) => DOCUMENT_ROLE_RANK[role])).toEqual([1, 2, 3]);
    expect(SHARE_LINK_GRANTS).toEqual({ [ShareLinkRole.Edit]: DocumentRole.Editor, [ShareLinkRole.Read]: DocumentRole.Reader });
  });
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
  test('builds encoded document api paths', () => {
    expect(documentApiPath({ documentId: 'a/b' })).toBe('/api/documents/a%2Fb');
    expect(documentApiPath({ documentId: 'd1', resource: DocumentResource.Events })).toBe('/api/documents/d1/events');
  });
});
```
- [ ] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-history/types test:unit` → FAIL: cannot find `./documents`. Commit the failing tests alone: `test(types): pin the documents and history contracts`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `documents.ts`
```ts
import { z } from 'zod';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const TITLE_MAX_LENGTH = 200;

export const MAX_UPLOAD_MEGABYTES = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MEGABYTES * BYTES_PER_MEGABYTE;
export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_EXTENSION = '.docx';
export const UPLOAD_FIELD = 'file';
export const UPLOAD_TOO_LARGE_MESSAGE = `Files up to ${MAX_UPLOAD_MEGABYTES} MB can be uploaded.`;
export const NOT_A_DOCX_MESSAGE = 'Only .docx files can be uploaded.';
export const INVALID_SHARE_LINK_MESSAGE = 'This link is no longer valid';
export const TIMELINE_PLACEHOLDER_MESSAGE = 'The timeline arrives in the next release';
export const UNTITLED_DOCUMENT_TITLE = 'Untitled document';
export const COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie';
export const DOCUMENT_NOT_READY_ERROR = 'NOT_READY';
export const DOCUMENT_NOT_READY_MESSAGE = 'The owner has not opened this document yet.';
export const DOCUMENT_UNAVAILABLE_MESSAGE = 'This document is no longer available';
export const READ_ONLY_BADGE_LABEL = 'Read only';
export const LINK_COPIED_MESSAGE = 'Link copied';

export enum DocumentRole { Owner = 'owner', Editor = 'editor', Reader = 'reader' }
export enum ShareLinkRole { Edit = 'edit', Read = 'read' }
export enum RoomMode { Create = 'create', Join = 'join' }

export const DOCUMENT_ROLE_RANK: Record<DocumentRole, number> = { [DocumentRole.Reader]: 1, [DocumentRole.Editor]: 2, [DocumentRole.Owner]: 3 };
export const SHARE_LINK_GRANTS: Record<ShareLinkRole, DocumentRole> = { [ShareLinkRole.Edit]: DocumentRole.Editor, [ShareLinkRole.Read]: DocumentRole.Reader };
export const titleSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX_LENGTH) });

export type UserReference = { id: string; name: string };
export type DocumentSummary = { id: string; title: string; owner: UserReference; updatedAt: number; role: DocumentRole };
export type DocumentsList = { mine: DocumentSummary[]; shared: DocumentSummary[] };
export type OpenedDocument = { document: DocumentSummary; role: DocumentRole; roomMode: RoomMode };
export type DocumentMember = { user: UserReference; role: DocumentRole; online: boolean };
export type DocumentMembers = { members: DocumentMember[] };
export type ShareLinks = Record<ShareLinkRole, string>;
export type AcceptedShareLink = { documentId: string };
```
`history.ts`
```ts
export enum BlockChangeKind { Created = 'created', Removed = 'removed', Modified = 'modified', Merged = 'merged' }
export type EventAuthor = { id: string | null; name: string };
export type DocumentEditEvent = { id: number; sequence: number; serverTime: number; authors: EventAuthor[]; blockId: string; kind: BlockChangeKind; inserted: string; deleted: string; imported: boolean };
export type DocumentEditEvents = { events: DocumentEditEvent[]; cursor: number | null };
```
`routes.ts`: add `AppRoute.Document = '/documents/:documentId'`, `AppRoute.Share = '/share/:token'`, `ApiPath.Documents = '/api/documents'`, `ApiPath.ShareLinks = '/api/share-links'`, and
```ts
export enum DocumentResource { Events = 'events', Members = 'members', Download = 'download', ShareLinks = 'share-links' }

export function documentPagePath(documentId: string): string {
  return `${AppRoute.Documents}/${encodeURIComponent(documentId)}`;
}

export function documentApiPath({ documentId, resource }: { documentId: string; resource?: DocumentResource }): string {
  const base = `${ApiPath.Documents}/${encodeURIComponent(documentId)}`;
  if (!resource) return base;
  return `${base}/${resource}`;
}

export function shareLinkAcceptPath(token: string): string {
  return `${ApiPath.ShareLinks}/${encodeURIComponent(token)}/accept`;
}
```
`http.ts`: add `Created = 201`, `NoContent = 204`, `Forbidden = 403`, `Conflict = 409`, `PayloadTooLarge = 413`, `UnsupportedMediaType = 415`, and `export enum HttpMethod { Get = 'GET', Post = 'POST', Patch = 'PATCH', Delete = 'DELETE' }`. `index.ts` re-exports `./documents` and `./history`.
- [ ] **Step 4: Run, expect pass** — 8 passed; `pnpm typecheck` clean.
- [ ] **Step 5: Commit** — `chore(deps): add the slice dependencies and the history package` (Step 0) and `feat(types): add documents, sharing and history contracts`

---

### Task 2: `libs/history` package and the pure POC modules (G1)

**Files:**
- Modify: `libs/history/src/index.ts`
- Create (lifted): `libs/history/src/{document-content,edit-windows,single-flight,edit-events,document-history,seed-docx,docx-signature}.ts`
- Test: `libs/history/src/{edit-windows,single-flight,docx-signature}.test.ts`

**Interfaces:**
- Consumes: `BlockChangeKind`.
- Produces: `readMainStoryBlocks(document: Y.Doc): Block[]`, `readMainStoryText(document)`, `groupIntoWindows({ events, rules }): EditWindow[]`, `SingleFlight<Value>`, `EditEvent = { sequence; serverTime; authorIds: string[]; blockId; kind: BlockChangeKind; inserted; deleted }` (resolved, for windows), `ProjectedEdit = Omit<EditEvent, 'authorIds'> & Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>` (raw, for storage), `projectEditEvents({ baselineState: Uint8Array; updates: LoggedUpdate[] }): ProjectedEdit[]`, `resolveAuthorIds({ update, identities }: { update: Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>; identities: Map<number, string> }): string[]`, `findBootstrapSequence(updates: LoggedUpdate[]): number | null`, `TrackedChangeKind { Insert, Delete }`, `SeedParagraph`, `buildSeedDocx(paragraphs): Promise<Buffer>`, `isDocx(bytes: Uint8Array): Promise<boolean>`.

- [ ] **Step 1: Package** — `libs/history` and its dependencies exist from Task 1; this task runs no `pnpm add`.
- [ ] **Step 2: Lift unchanged** — `cp poc/lib/{document-content,edit-windows,single-flight}.ts libs/history/src/` and `cp poc/tests/node/{edit-windows,single-flight}.test.ts libs/history/src/`; rewrite the tests' imports to `./edit-windows`, `./single-flight` and `BlockChangeKind` from `@superdoc-history/types`.
- [ ] **Step 3: Failing test** — `docx-signature.test.ts`
```ts
async function zipWith(entry: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(entry, 'x');
  return zip.generateAsync({ type: 'uint8array' });
}

test.each([
  ['a generated docx', () => buildSeedDocx([{ text: 'Hello', trackedChanges: [] }]), true],
  ['a zip without word/document.xml', () => zipWith('notes.txt'), false],
  ['bytes without the zip signature', async () => new TextEncoder().encode('%PDF-1.7'), false],
  ['a truncated zip', async () => (await zipWith('word/document.xml')).slice(0, 40), false],
])('isDocx: %s → %s', async (_, bytes, expected) => expect(await isDocx(await bytes())).toBe(expected));
```
- [ ] **Step 4: Run, expect failure** — `pnpm --filter @superdoc-history/history test:unit` → FAIL: cannot find `./docx-signature`. Commit the failing tests alone: `test(history): pin docx detection and the lifted POC suites`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 5: Implement** — `docx-signature.ts`
```ts
import JSZip from 'jszip';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const MAIN_DOCUMENT_ENTRY = 'word/document.xml';

export async function isDocx(bytes: Uint8Array): Promise<boolean> {
  const hasZipSignature = ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
  if (!hasZipSignature) return false;
  try {
    const zip = await JSZip.loadAsync(bytes);
    return zip.file(MAIN_DOCUMENT_ENTRY) !== null;
  } catch {
    return false;
  }
}
```
`seed-docx.ts`: copy `poc/lib/seed-docx.ts`; add `export enum TrackedChangeKind { Insert = 'insert', Delete = 'delete' }`, type `kind: TrackedChangeKind`, compare with `TrackedChangeKind.Insert`. `edit-events.ts`: copy `poc/lib/edit-events.ts`; import `BlockChangeKind` from `@superdoc-history/types` (delete the local enum) and `LoggedUpdate` from `./update-log` (Task 3); the projector starts from state bytes, because the product projects from a materialized cursor, and it emits the update's raw identity facts instead of resolved authors, because authors are resolved at read time. `resolveAuthorIds` keeps its POC body; only its `update` parameter narrows to `Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>` so a stored event can be resolved too. The projector becomes:
```ts
export type ProjectedEdit = Omit<EditEvent, 'authorIds'> & Pick<LoggedUpdate, 'yjsClientIds' | 'connectionUserId'>;

export function projectEditEvents({ baselineState, updates }: { baselineState: Uint8Array; updates: LoggedUpdate[] }): ProjectedEdit[] {
  const document = new Y.Doc();
  Y.applyUpdate(document, baselineState);
  let previous = readBlockStates(document);
  return updates.flatMap((update) => {
    Y.applyUpdate(document, update.update);
    const current = readBlockStates(document);
    const changes = diffBlocks({ before: previous, after: current });
    previous = current;
    const { sequence, serverTime, yjsClientIds, connectionUserId } = update;
    return changes.map((change) => ({ ...change, sequence, serverTime, yjsClientIds, connectionUserId }));
  });
}
``` `document-history.ts`: copy only `findBootstrapSequence` and its three constants from `poc/lib/document-history.ts`, with return type `number | null` and its last two lines replaced by the lines below, because an unbootstrapped room is a normal state for the projection:
```ts
  if (!committed) return null;
  return committed.sequence;
```
`index.ts` re-exports every module of Tasks 2–4.
- [ ] **Step 6: Run, expect pass** once Task 3's `update-log.ts` exists (typecheck needs `LoggedUpdate`): developer A runs Tasks 2 and 3 back to back.
- [ ] **Step 7: Commit** — `feat(history): lift the pure POC history modules into libs/history`

---

### Task 3: Update log on better-sqlite3 with drizzle migrations (G1)

**Files:**
- Modify: `libs/history/src/index.ts`
- Create: `libs/history/src/schema/history.ts`, `libs/history/src/migrations.ts`, `libs/history/src/update-log.ts`, `libs/history/src/testing/{index,test-database,room-fixtures}.ts`, `libs/history/drizzle.history.config.ts`, `libs/history/drizzle/history/` (generated)
- Test: `libs/history/src/{relay-attribution,snapshots,update-log}.test.ts`

**Interfaces:**
- Produces: `MigrationSet { History = 'history', ReadModel = 'read-model' }`, `HISTORY_MIGRATIONS_PATH = join('libs', 'history', 'drizzle')`, `runMigrationSet({ sqlite, migrationsFolder })`; `UpdateLog` constructed with `Database.Database`: `append`, `observeClientIdentity`, `declareClientIdentity`, `identitySources`, `clientIdentities`, `read`, `readRange` (POC signatures), plus `readBatch({ documentName, afterSequence, limit }): LoggedUpdate[]`, `hasUpdates(documentName): boolean`, `forget(documentName): void`; `materialize`, `compact`, `replay`, `extractStructClientIds`, `IdentitySource`, `LoggedUpdate`; from `@superdoc-history/history/testing`: `openTestDatabase({ set, path? }): Database.Database`, `temporaryDatabasePath(set): string`, `writeStory({ document, texts })`, `commitBootstrap(document)`.

- [ ] **Step 1: Schema and migration** — `schema/history.ts` declares, with `sqliteTable` and the POC's exact columns:
  - `updates`: `sequence` integer primary key autoincrement, `document_name` text, `connection_user_id` text, `yjs_client_ids` text, `server_time` integer, `update_bytes` blob, all not null; `index('updates_by_document').on(documentName, sequence)`.
  - `snapshots`: `document_name` text, `sequence` integer, `state` blob, not null; primary key `(document_name, sequence)`.
  - `client_identities`: `document_name` text, `yjs_client_id` integer, `user_id` text, `source` text, not null; primary key `(document_name, yjs_client_id)`.

`drizzle.history.config.ts`: `defineConfig({ dialect: 'sqlite', schema: './src/schema/history.ts', out: './drizzle/history' })`; `pnpm --filter @superdoc-history/history exec drizzle-kit generate --config drizzle.history.config.ts`; the SQL contains ``CREATE INDEX `updates_by_document` ON `updates` (`document_name`,`sequence`)``. `migrations.ts` exports `MigrationSet`, `HISTORY_MIGRATIONS_PATH = join('libs', 'history', 'drizzle')` and `runMigrationSet({ sqlite, migrationsFolder })`, whose body is `migrate(drizzle(sqlite), { migrationsFolder })` (`drizzle-orm/better-sqlite3` and its `migrator`). `testing/test-database.ts`
```ts
export function temporaryDatabasePath(set: MigrationSet): string {
  return join(mkdtempSync(join(tmpdir(), 'superdoc-history-lib-')), `${set}.sqlite`);
}

export function openTestDatabase({ set, path = temporaryDatabasePath(set) }: { set: MigrationSet; path?: string }): Database.Database {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  runMigrationSet({ sqlite, migrationsFolder: fileURLToPath(new URL(`../../drizzle/${set}`, import.meta.url)) });
  return sqlite;
}
```
`testing/room-fixtures.ts` (a SuperDoc-shaped room without SuperDoc, used here, in Task 4 and in the server tests)
```ts
const MAIN_STORY_KEY = 'room::story::main:word_document.xml';

export function writeStory({ document, texts }: { document: Y.Doc; texts: string[] }): void {
  const blockIds = texts.map((_, index) => `b${index}`);
  const blocks = texts.map((text, index) => ({ blockId: blockIds[index], text }));
  document.getMap('content').set(MAIN_STORY_KEY, { blocks, order: Object.fromEntries(blockIds.map((blockId, index) => [blockId, index])) });
}

export function commitBootstrap(document: Y.Doc): void {
  document.getMap('meta').set('bootstrapState', 'committed');
}
```
`testing/index.ts` re-exports both files.
- [ ] **Step 2: Port the POC suites and add the new cases** — copy `poc/tests/node/relay-attribution.test.ts` and `snapshots.test.ts`; replace `new UpdateLog(path)` with `new UpdateLog(openTestDatabase({ set: MigrationSet.History, path }))` and `log.close()` with closing that handle. `update-log.test.ts`
```ts
const DOCUMENT = 'document-1';

function typedUpdates(count: number): Uint8Array[] {
  const document = new Y.Doc();
  const captured: Uint8Array[] = [];
  document.on('update', (update: Uint8Array) => captured.push(update));
  Array.from({ length: count }).forEach((_, index) => document.getText('t').insert(index, 'a'));
  return captured;
}

function logWith(count: number): UpdateLog {
  const log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  typedUpdates(count).forEach((update) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  return log;
}

test('binds a Uint8Array as is and stores identical bytes', () => {
  const sqlite = openTestDatabase({ set: MigrationSet.History });
  const [input] = typedUpdates(1);
  new UpdateLog(sqlite).append({ documentName: DOCUMENT, connectionUserId: 'ana', update: input! });
  const row = sqlite.prepare('SELECT update_bytes FROM updates').get() as { update_bytes: Uint8Array };
  expect(new Uint8Array(row.update_bytes)).toEqual(input);
});
test('compaction reads only the tail after the latest snapshot', () => {
  const log = logWith(25);
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([10, 20]);
  typedUpdates(5).forEach((update) => log.append({ documentName: DOCUMENT, connectionUserId: 'ana', update }));
  expect(compact({ log, documentName: DOCUMENT, everyUpdates: 10 })).toEqual([30]);
});
```
Also: `logWith(5).readBatch({ afterSequence: 1, limit: 2 })` returns sequences `[2, 3]`; after `forget(DOCUMENT)` on a log that also holds `'other'`, `hasUpdates(DOCUMENT)` is false, `clientIdentities(DOCUMENT).size` is 0 and `hasUpdates('other')` is true.
- [ ] **Step 3: Run, expect failure** — FAIL: cannot find `./update-log`. Commit the failing tests alone: `test(history): pin the update log on better-sqlite3`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 4: Implement** — copy `poc/lib/update-log.ts`; delete the `node:sqlite` import, the constructor's `exec` block and `close()`; `import type Database from 'better-sqlite3'`, field `private readonly database: Database.Database`, `constructor(database: Database.Database) { this.database = database; }`. Bind the `Uint8Array` as is (spike fact 4). Extract the row mapping of `readRange` into `function toLoggedUpdate(row: UpdateRow): LoggedUpdate` (keeps `new Uint8Array(row.update_bytes)`). Add:
```ts
  readBatch({ documentName, afterSequence, limit }: { documentName: string; afterSequence: number; limit: number }): LoggedUpdate[] {
    const rows = this.database.prepare('SELECT * FROM updates WHERE document_name = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(documentName, afterSequence, limit) as UpdateRow[];
    return rows.map(toLoggedUpdate);
  }

  hasUpdates(documentName: string): boolean {
    return this.database.prepare('SELECT 1 FROM updates WHERE document_name = ? LIMIT 1').get(documentName) !== undefined;
  }

  forget(documentName: string): void {
    this.database.transaction(() => HISTORY_TABLES.forEach((table) => this.database.prepare(`DELETE FROM ${table} WHERE document_name = ?`).run(documentName)))();
  }
```
with `const HISTORY_TABLES = ['updates', 'snapshots', 'client_identities'];` at the top. Replace `compact` so it reads only the tail:
```ts
export function compact({ log, documentName, everyUpdates }: { log: UpdateLog; documentName: string; everyUpdates: number }): number[] {
  const latest = log.latestSnapshot({ documentName, atOrBefore: Number.MAX_SAFE_INTEGER });
  const afterSequence = latest ? latest.sequence : 0;
  const tail = log.readRange({ documentName, afterSequence, untilSequence: Number.MAX_SAFE_INTEGER });
  const boundaries = tail.filter((_, index) => (index + 1) % everyUpdates === 0).map((update) => update.sequence);
  boundaries.forEach((sequence) => log.writeSnapshot({ documentName, sequence, state: Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: sequence })) }));
  return boundaries;
}
```
- [ ] **Step 5: Run, expect pass** — relay (4), snapshots (2), update-log (4) and Task 2's suites; `pnpm typecheck` clean.
- [ ] **Step 6: Commit** — `feat(history): port the update log to better-sqlite3 with drizzle migrations`

---

### Task 4: Read model, projection cursor and imported revisions mapping (G1)

**Files:**
- Modify: `libs/history/src/index.ts`
- Create: `libs/history/src/schema/read-model.ts`, `libs/history/drizzle.read-model.config.ts`, `libs/history/drizzle/read-model/` (generated), `libs/history/src/{read-model,projection,imported-revisions}.ts`
- Test: `libs/history/src/{projection,imported-revisions}.test.ts`

**Interfaces:**
- Consumes: `UpdateLog`, `materialize`, `projectEditEvents`, `findBootstrapSequence`.
- Produces: `ReadModel` (constructed with `Database.Database`): `cursor(documentName): number | null`, `commit({ documentName, events: ProjectedEdit[], lastSequence }): void`, `commitImported({ documentName, revisions: ImportedRevision[] }): void`, `read({ documentName, afterSequence: number | null }): StoredEditEvent[]`, `forget(documentName): void`; `StoredEditEvent = Omit<ProjectedEdit, 'yjsClientIds' | 'connectionUserId'> & { id: number; imported: boolean; yjsClientIds: number[] | null; connectionUserId: string | null; authorName: string | null }`; `ImportedRevision = { revisionId; authorName; serverTime: number; blockId; inserted; deleted }`; `PROJECTION_BATCH_SIZE = 2000`; `projectPending({ log, readModel, documentName, batchSize? }): number | null`; `TrackedChangeType`, `ListedTrackedChange`, `toImportedRevisions(items): ImportedRevision[]`, `MissingTrackedChangeTextError`.

- [ ] **Step 1: Schema** — `schema/read-model.ts`, generated with `drizzle.read-model.config.ts` (`out: './drizzle/read-model'`):
  - `edit_events`: `id` integer primary key autoincrement; not null `document_name`, `event_key`, `block_id`, `kind`, `inserted`, `deleted` (text) and `sequence`, `server_time` (integer), `imported` (integer, `mode: 'boolean'`); nullable `yjs_client_ids` (JSON text), `connection_user_id` and `author_name` (text): live rows fill the first two, imported rows only the last; `index('edit_events_by_document').on(documentName, sequence)` and `uniqueIndex('edit_events_by_key').on(documentName, eventKey)`.
  - `projection_cursor`: `document_name` text primary key, `last_sequence` integer not null.
- [ ] **Step 2: Failing tests** — `projection.test.ts`
```ts
const DOCUMENT = 'document-1';
let log: UpdateLog;
let readModel: ReadModel;

function author(userId: string): Y.Doc {
  const document = new Y.Doc();
  document.on('update', (update: Uint8Array) => log.append({ documentName: DOCUMENT, connectionUserId: userId, update }));
  return document;
}

function bootstrapped(texts: string[]): Y.Doc {
  const ana = author('ana');
  writeStory({ document: ana, texts });
  commitBootstrap(ana);
  return ana;
}

function events() {
  return readModel.read({ documentName: DOCUMENT, afterSequence: null });
}

beforeEach(() => {
  log = new UpdateLog(openTestDatabase({ set: MigrationSet.History }));
  readModel = new ReadModel(openTestDatabase({ set: MigrationSet.ReadModel }));
});

test('projects edits after the bootstrap with the raw identity facts', () => {
  const ana = bootstrapped(['Hello']);
  writeStory({ document: ana, texts: ['Hello world'] });
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(events().map(({ kind, inserted, yjsClientIds, connectionUserId }) => ({ kind, inserted, yjsClientIds, connectionUserId }))).toEqual([{ kind: BlockChangeKind.Modified, inserted: ' world', yjsClientIds: [ana.clientID], connectionUserId: 'ana' }]);
});
test('a rewound cursor re-projects without duplicates', () => {
  const ana = bootstrapped(['a']);
  writeStory({ document: ana, texts: ['ab'] });
  writeStory({ document: ana, texts: ['abc'] });
  projectPending({ log, readModel, documentName: DOCUMENT });
  readModel.commit({ documentName: DOCUMENT, events: [], lastSequence: events()[0]!.sequence - 1 });
  projectPending({ log, readModel, documentName: DOCUMENT });
  expect(events()).toHaveLength(2);
});
```
Also in `projection.test.ts`, each input → expected:
- `projects nothing until the bootstrap commits`: a story written without `commitBootstrap` → `projectPending` returns `null`, `events()` is `[]`.
- `projects in batches and resumes from the cursor`: bootstrapped `['']` then seven writes `'x'.repeat(n)` with `batchSize: 3` → joined `inserted` is `'xxxxxxx'` and the returned cursor equals the last logged sequence.
- `imported revisions are stored once, with sequence 0 and the revision author`: `commitImported` twice with revision `r1` by "Chris Crawford" → exactly one event `{ imported: true, authorName: 'Chris Crawford', sequence: 0, yjsClientIds: null, connectionUserId: null }`.
- `forgetting a document clears its events and cursor`: `commit({ lastSequence: 3 })` then `forget` → `cursor` is `null`.

`imported-revisions.test.ts`: the T10 item `{ id: 'r1', type: TrackedChangeType.Insertion, author: 'Ana Souza', date: '2026-03-01T18:30:00Z', insertedText: ' GDPR clause', deletedText: null, imported: true, navigationTarget: { blockId: '00000002' } }` maps to `{ revisionId: 'r1', authorName: 'Ana Souza', serverTime: Date.parse('2026-03-01T18:30:00Z'), blockId: '00000002', inserted: ' GDPR clause', deleted: '' }`; a deletion whose `deletedText` is `null` throws `MissingTrackedChangeTextError`.
- [ ] **Step 3: Run, expect failure** — cannot find `./projection`, `./read-model`, `./imported-revisions`. Commit the failing tests alone: `test(history): pin the projection cursor and the read model`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 4: Implement** — `read-model.ts`
```ts
import type Database from 'better-sqlite3';
import { BlockChangeKind } from '@superdoc-history/types';
import type { ProjectedEdit } from './edit-events';

const IMPORTED_SEQUENCE = 0;
const ALL_SEQUENCES = IMPORTED_SEQUENCE - 1;
const IMPORTED_KEY_PREFIX = 'imported';
const INSERT_EVENT = `INSERT OR IGNORE INTO edit_events (document_name, event_key, sequence, server_time, yjs_client_ids, connection_user_id, author_name, block_id, kind, inserted, deleted, imported)
  VALUES (@documentName, @eventKey, @sequence, @serverTime, @yjsClientIds, @connectionUserId, @authorName, @blockId, @kind, @inserted, @deleted, @imported)`;

export type StoredEditEvent = Omit<ProjectedEdit, 'yjsClientIds' | 'connectionUserId'> & { id: number; imported: boolean; yjsClientIds: number[] | null; connectionUserId: string | null; authorName: string | null };
export type ImportedRevision = { revisionId: string; authorName: string; serverTime: number; blockId: string; inserted: string; deleted: string };
type EventRow = { id: number; sequence: number; server_time: number; yjs_client_ids: string | null; connection_user_id: string | null; author_name: string | null; block_id: string; kind: BlockChangeKind; inserted: string; deleted: string; imported: number };

function toStoredEvent(row: EventRow): StoredEditEvent {
  return { id: row.id, sequence: row.sequence, serverTime: row.server_time, yjsClientIds: row.yjs_client_ids === null ? null : JSON.parse(row.yjs_client_ids), connectionUserId: row.connection_user_id, authorName: row.author_name, blockId: row.block_id, kind: row.kind, inserted: row.inserted, deleted: row.deleted, imported: row.imported === 1 };
}

export class ReadModel {
  private readonly database: Database.Database;

  constructor(database: Database.Database) {
    this.database = database;
  }

  commit({ documentName, events, lastSequence }: { documentName: string; events: ProjectedEdit[]; lastSequence: number }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    const advance = this.database.prepare('INSERT INTO projection_cursor (document_name, last_sequence) VALUES (?, ?) ON CONFLICT (document_name) DO UPDATE SET last_sequence = excluded.last_sequence');
    this.database.transaction(() => {
      events.forEach((event) => insert.run({ documentName, eventKey: `${event.sequence}:${event.blockId}:${event.kind}`, sequence: event.sequence, serverTime: event.serverTime, yjsClientIds: JSON.stringify(event.yjsClientIds), connectionUserId: event.connectionUserId, authorName: null, blockId: event.blockId, kind: event.kind, inserted: event.inserted, deleted: event.deleted, imported: 0 }));
      advance.run(documentName, lastSequence);
    })();
  }

  commitImported({ documentName, revisions }: { documentName: string; revisions: ImportedRevision[] }): void {
    const insert = this.database.prepare(INSERT_EVENT);
    this.database.transaction(() => revisions.forEach((revision) => insert.run({ documentName, eventKey: `${IMPORTED_KEY_PREFIX}:${revision.revisionId}`, sequence: IMPORTED_SEQUENCE, serverTime: revision.serverTime, yjsClientIds: null, connectionUserId: null, authorName: revision.authorName, blockId: revision.blockId, kind: BlockChangeKind.Modified, inserted: revision.inserted, deleted: revision.deleted, imported: 1 })))();
  }

  read({ documentName, afterSequence }: { documentName: string; afterSequence: number | null }): StoredEditEvent[] {
    const lowerBound = afterSequence === null ? ALL_SEQUENCES : afterSequence;
    const rows = this.database.prepare('SELECT * FROM edit_events WHERE document_name = ? AND sequence > ? ORDER BY sequence, id').all(documentName, lowerBound) as EventRow[];
    return rows.map(toStoredEvent);
  }
}
```
`cursor(documentName)` selects `last_sequence` from `projection_cursor` and returns `null` when there is no row; `forget(documentName)` deletes the document's rows from `edit_events` and `projection_cursor` in one transaction, like `UpdateLog.forget`.
`projection.ts`
```ts
export const PROJECTION_BATCH_SIZE = 2000;

type Projection = { log: UpdateLog; readModel: ReadModel; documentName: string; batchSize: number };

function continueProjection({ projection, cursor }: { projection: Projection; cursor: number }): number {
  const { log, readModel, documentName, batchSize } = projection;
  const batch = log.readBatch({ documentName, afterSequence: cursor, limit: batchSize });
  const last = batch.at(-1);
  if (!last) return cursor;
  const baselineState = Y.encodeStateAsUpdate(materialize({ log, documentName, untilSequence: cursor }));
  const events = projectEditEvents({ baselineState, updates: batch });
  readModel.commit({ documentName, events, lastSequence: last.sequence });
  return continueProjection({ projection, cursor: last.sequence });
}

export function projectPending({ log, readModel, documentName, batchSize = PROJECTION_BATCH_SIZE }: { log: UpdateLog; readModel: ReadModel; documentName: string; batchSize?: number }): number | null {
  const projection = { log, readModel, documentName, batchSize };
  const cursor = readModel.cursor(documentName);
  if (cursor !== null) return continueProjection({ projection, cursor });
  const bootstrapSequence = findBootstrapSequence(log.read({ documentName, untilSequence: Number.MAX_SAFE_INTEGER }));
  if (bootstrapSequence === null) return null;
  readModel.commit({ documentName, events: [], lastSequence: bootstrapSequence });
  return continueProjection({ projection, cursor: bootstrapSequence });
}
```
Events and the cursor commit in one transaction, and `INSERT OR IGNORE` on `(document_name, event_key)` makes a re-projection after a crash idempotent. `imported-revisions.ts`
```ts
export enum TrackedChangeType { Insertion = 'insertion', Deletion = 'deletion' }
export type ListedTrackedChange = { id: string; type: TrackedChangeType; author: string; date: string; insertedText: string | null; deletedText: string | null; imported: boolean; navigationTarget: { blockId: string } };

export class MissingTrackedChangeTextError extends Error {
  constructor(revisionId: string) {
    super(`Tracked change ${revisionId} has no text.`);
  }
}

function requireText({ text, revisionId }: { text: string | null; revisionId: string }): string {
  if (text === null) throw new MissingTrackedChangeTextError(revisionId);
  return text;
}

export function toImportedRevisions(items: ListedTrackedChange[]): ImportedRevision[] {
  return items.map((item) => {
    const isInsertion = item.type === TrackedChangeType.Insertion;
    const text = requireText({ text: isInsertion ? item.insertedText : item.deletedText, revisionId: item.id });
    return { revisionId: item.id, authorName: item.author, serverTime: Date.parse(item.date), blockId: item.navigationTarget.blockId, inserted: isInsertion ? text : '', deleted: isInsertion ? '' : text };
  });
}
```
- [ ] **Step 5: Run, expect pass** — projection (6), imported revisions (2) and all earlier suites.
- [ ] **Step 6: Commit** — `feat(history): add the read model, the projection cursor and imported revisions`

---

### Task 5: Server databases, documents schema, repository, guards and file storage (G2)

**Files:**
- Modify: `apps/server/src/database/{connection,migrate,migrate.test,connection.test}.ts`, `apps/server/src/http/app.ts`, `apps/server/src/server.ts`, `apps/server/src/testing/test-server.ts`
- Create: `apps/server/src/database/schema/documents.ts`, `apps/server/drizzle/0001_*.sql` (generated), `apps/server/src/documents/{documents-repository,require-document-role,file-storage,local-disk-file-storage}.ts`, `apps/server/src/http/require-user.ts`
- Test: `apps/server/src/documents/{documents-repository,local-disk-file-storage}.test.ts`

**Interfaces:**
- Consumes: `MigrationSet`, `HISTORY_MIGRATIONS_PATH`, `runMigrationSet`, Task 1 contracts.
- Produces: `openSqliteFile({ directory, fileName }): Database.Database`; `HISTORY_DATABASE_FILE = 'history.sqlite'`, `READ_MODEL_DATABASE_FILE = 'read-model.sqlite'`, `DOCUMENT_FILES_DIRECTORY = 'documents'`; `findMigrationsFolder({ startUrl, relativePath })`; `runMigrations(database: AuthDatabase)` (unchanged behaviour); `runHistoryMigrations({ sqlite, set })`; tables `documents`, `documentMembers`, `documentShareLinks`; `DocumentsRepository(database: AuthDatabase)`: `create({ id, title, ownerUserId })`, `findRole({ documentId, userId }): DocumentRole | null`, `list(userId): DocumentsList`, `summary({ documentId, userId }): DocumentSummary`, `rename({ documentId, title })`, `touch(documentId)`, `remove(documentId)`, `members(documentId): { user: UserReference; role: DocumentRole }[]`, `grant({ documentId, userId, role })`, `userNames(userIds: string[]): Map<string, string>`; `requireDocumentRole({ documents, documentId, userId, minimumRole }): DocumentRole`, `DocumentNotFoundError`, `DocumentRoleTooLowError`; `requireUser({ auth })` with `SignedIn = { Variables: { user: SessionUser } }`; `DocumentFileStorage = { put({ documentId, bytes }): Promise<void>; read(documentId): Promise<Uint8Array>; remove(documentId): Promise<void>; pathOf(documentId): string }`, `createLocalDiskFileStorage(directory)`, `InvalidDocumentIdError`; `RunningServer.services = { documents, storage }` (Tasks 6, 7, 9 add `log`, `hocuspocus`, `readModel`, `scheduler`, `runtime`, `shareLinks`); `startTestServer({ databaseDirectory? })`; `TestServer` exposes `services` and `databaseDirectory`; `signInExisting({ server, email, password }): Promise<string>`; `currentUserId({ server, cookie }): Promise<string>`; `TestUser = { id: string; email: string; cookie: string }`; `signedInUser({ server, name }): Promise<TestUser>` (signs up `${name.toLowerCase()}-<8 uuid chars>@example.com`); `signedInOwner(): Promise<{ server: TestServer; owner: TestUser }>`; `TEST_USER_PASSWORD = 'superdoc-demo'`.

- [ ] **Step 1: Failing tests** — `documents-repository.test.ts`
```ts
async function twoUsers() {
  const { server, owner } = await signedInOwner();
  return { server, ana: owner.id, bruno: (await signedInUser({ server, name: 'Bruno' })).id };
}

test('grant upgrades a role and never downgrades it', async () => {
  const { server, ana, bruno } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Editor });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  documents.grant({ documentId, userId: ana, role: DocumentRole.Reader });
  expect([documents.findRole({ documentId, userId: bruno }), documents.findRole({ documentId, userId: ana })]).toEqual([DocumentRole.Editor, DocumentRole.Owner]);
  await server.stop();
});
```
Also in `documents-repository.test.ts`, each input → expected:
- `the owner sees it as mine and a member as shared, with the owner named`: Ana creates "Plan", grants Bruno reader → `list(bruno)` is `{ mine: [], shared: [Ana's summary with role reader] }` and the summary's `owner` is `{ id: ana, name: 'Ana' }`.
- `requireDocumentRole hides a non-member as not found and refuses a low role`: Bruno before any grant → `DocumentNotFoundError`; as reader asking for editor → `DocumentRoleTooLowError`.
- `removing a document cascades its members`: `remove(documentId)` → `findRole` is `null` for both users.

`local-disk-file-storage.test.ts`: put then read returns identical bytes; `remove` of a missing id resolves; `pathOf('../auth')` throws `InvalidDocumentIdError`. `connection.test.ts`: the migrated auth file lists `documents`, `document_members`, `document_share_links`; `PRAGMA synchronous` returns `1` and `PRAGMA foreign_keys` returns `1` on an `openSqliteFile` handle. `migrate.test.ts` calls become `findMigrationsFolder({ startUrl: bundle, relativePath: 'drizzle' })`.
- [ ] **Step 2: Run, expect failure** — `pnpm --filter @superdoc-history/server test:unit`. Commit the failing tests alone: `test(server): pin documents membership and file storage`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `connection.ts`
```ts
const BUSY_TIMEOUT_MS = 5000;
export const HISTORY_DATABASE_FILE = 'history.sqlite';
export const READ_MODEL_DATABASE_FILE = 'read-model.sqlite';
export const DOCUMENT_FILES_DIRECTORY = 'documents';

export function openSqliteFile({ directory, fileName }: { directory: string; fileName: string }): Database.Database {
  ensureWritableDirectory(directory);
  const sqlite = new Database(join(directory, fileName));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma(`busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return sqlite;
}

export function openDatabase({ directory, fileName }: { directory: string; fileName: string }): AuthDatabase {
  const sqlite = openSqliteFile({ directory, fileName });
  return { sqlite, drizzle: drizzle(sqlite, { schema: authSchema }) };
}
```
`migrate.ts`: `findMigrationsFolder({ startUrl, relativePath })` is the slice 1 walk-up with `join(directory, relativePath, MIGRATIONS_JOURNAL_PATH)` as the probe and `join(directory, relativePath)` as the result; `runMigrations` passes `relativePath: 'drizzle'` (constant `AUTH_MIGRATIONS_PATH`); and
```ts
export function runHistoryMigrations({ sqlite, set }: { sqlite: Database.Database; set: MigrationSet }): void {
  runMigrationSet({ sqlite, migrationsFolder: findMigrationsFolder({ startUrl: import.meta.url, relativePath: join(HISTORY_MIGRATIONS_PATH, set) }) });
}
```
`schema/documents.ts` (picked up by the existing `./src/database/schema/*.ts` glob; generate `drizzle/0001_*.sql`), all columns not null unless noted, timestamps `integer(..., { mode: 'timestamp_ms' })`:
  - `documents`: `id` text primary key, `title` text, `owner_user_id` text references `user.id` on delete cascade, `created_at`, `updated_at`.
  - `document_members`: `document_id` references `documents.id` on delete cascade, `user_id` references `user.id` on delete cascade, `role` `text('role', { enum: [DocumentRole.Owner, DocumentRole.Editor, DocumentRole.Reader] })`, `joined_at`; primary key `(document_id, user_id)`; `index('document_members_by_user').on(userId)`.
  - `document_share_links`: `document_id` references `documents.id` on delete cascade, `role` `text('role', { enum: [ShareLinkRole.Edit, ShareLinkRole.Read] })`, `nonce` text, `token_hash` text unique, `created_at`; primary key `(document_id, role)`.

`documents-repository.ts` (core methods; `findRole` selects `documentMembers.role` for the pair and returns `null` without a row; `summary` is `selectSummaries(and(eq(documentMembers.userId, userId), eq(documents.id, documentId)))[0]`, throwing `DocumentNotFoundError` when absent; `rename`/`touch` update `title`/`updatedAt: new Date()`; `remove` deletes the `documents` row; `members` joins `documentMembers` to `user`; `userNames` selects `user.id, user.name` with `inArray`)
```ts
export class DocumentsRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  create({ id, title, ownerUserId }: { id: string; title: string; ownerUserId: string }): void {
    const now = new Date();
    this.database.drizzle.transaction((transaction) => {
      transaction.insert(documents).values({ id, title, ownerUserId, createdAt: now, updatedAt: now }).run();
      transaction.insert(documentMembers).values({ documentId: id, userId: ownerUserId, role: DocumentRole.Owner, joinedAt: now }).run();
    });
  }

  list(userId: string): DocumentsList {
    const summaries = this.selectSummaries(eq(documentMembers.userId, userId));
    return { mine: summaries.filter((summary) => summary.role === DocumentRole.Owner), shared: summaries.filter((summary) => summary.role !== DocumentRole.Owner) };
  }

  grant({ documentId, userId, role }: { documentId: string; userId: string; role: DocumentRole }): void {
    const current = this.findRole({ documentId, userId });
    if (!current) {
      this.database.drizzle.insert(documentMembers).values({ documentId, userId, role, joinedAt: new Date() }).run();
      return;
    }
    if (DOCUMENT_ROLE_RANK[current] >= DOCUMENT_ROLE_RANK[role]) return;
    this.database.drizzle.update(documentMembers).set({ role }).where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId))).run();
  }

  private selectSummaries(condition: SQL): DocumentSummary[] {
    return this.database.drizzle
      .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt, role: documentMembers.role, ownerId: user.id, ownerName: user.name })
      .from(documentMembers)
      .innerJoin(documents, eq(documents.id, documentMembers.documentId))
      .innerJoin(user, eq(user.id, documents.ownerUserId))
      .where(condition)
      .orderBy(desc(documents.updatedAt))
      .all()
      .map((row) => ({ id: row.id, title: row.title, updatedAt: row.updatedAt.getTime(), role: row.role, owner: { id: row.ownerId, name: row.ownerName } }));
  }
}
```
`require-document-role.ts`
```ts
export function requireDocumentRole({ documents, documentId, userId, minimumRole }: { documents: DocumentsRepository; documentId: string; userId: string; minimumRole: DocumentRole }): DocumentRole {
  const role = documents.findRole({ documentId, userId });
  if (!role) throw new DocumentNotFoundError();
  if (DOCUMENT_ROLE_RANK[role] < DOCUMENT_ROLE_RANK[minimumRole]) throw new DocumentRoleTooLowError();
  return role;
}
```
`require-user.ts`: `createMiddleware<SignedIn>` from `hono/factory` that calls `readSession({ auth, headers: context.req.raw.headers })`, answers 401 `{ error: 'Unauthorized' }` (constant `UNAUTHORIZED_MESSAGE`) without a user, else `context.set('user', user)` and `await next()`. `local-disk-file-storage.ts`
```ts
const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createLocalDiskFileStorage(directory: string): DocumentFileStorage {
  function pathOf(documentId: string): string {
    if (!DOCUMENT_ID_PATTERN.test(documentId)) throw new InvalidDocumentIdError();
    return join(directory, `${documentId}${DOCX_EXTENSION}`);
  }
  return {
    pathOf,
    async put({ documentId, bytes }) {
      await mkdir(directory, { recursive: true });
      await writeFile(pathOf(documentId), bytes);
    },
    read: async (documentId) => new Uint8Array(await readFile(pathOf(documentId))),
    remove: (documentId) => rm(pathOf(documentId), { force: true }),
  };
}
```
`pathOf` is on the interface because `@superdoc/sdk`'s `open({ doc })` takes a path. `server.ts` creates `DocumentsRepository` and `createLocalDiskFileStorage(join(environment.databaseDirectory, DOCUMENT_FILES_DIRECTORY))` and returns them as `services`. `test-server.ts`: `startTestServer({ trustProxy = true, databaseDirectory = mkdtempSync(...) })`; `signInExisting` is the sign-in half of `signInAndGetCookie` (which now calls it); `currentUserId` GETs `ApiPath.Me`; `signedInUser` runs `signInAndGetCookie` with the name and a unique email, then `currentUserId`; `signedInOwner` starts a test server and returns `signedInUser({ server, name: 'Ana' })` as `owner`.
- [ ] **Step 4: Run, expect pass** — the new suites and every slice 1 suite.
- [ ] **Step 5: Commit** — `feat(server): add documents, membership and file storage`

---

### Task 6: Collaboration hooks with membership, read-only and the update log (G2)

**Files:**
- Create: `apps/server/src/collaboration/{room-name,client-declarations}.ts`, `apps/server/src/testing/collaboration-client.ts`
- Modify: `apps/server/src/collaboration/collaboration-server.ts`, `apps/server/src/collaboration/collaboration-server.test.ts`, `apps/server/src/server.ts`, `apps/server/src/http/app.ts` (no route change; `services` gains `log`), `apps/server/src/testing/test-server.ts`
- Test: `apps/server/src/collaboration/{room-name,collaboration-history}.test.ts`

**Interfaces:**
- Consumes: `DocumentsRepository.findRole`, `UpdateLog`, `materialize`, `compact`, `openSqliteFile`, `runHistoryMigrations`, `COLLABORATION_TOKEN_PLACEHOLDER` (now imported from `@superdoc-history/types`; delete the server constant).
- Produces: `SUPERDOC_ROOM_PREFIX = 'sd2/v2.1/'`, `documentIdFromRoomName(roomName): string | null`; `createCollaborationServer({ auth, documents, log, onStored }: { auth: Auth; documents: DocumentsRepository; log: UpdateLog; onStored: (documentId: string) => void }): Hocuspocus`; `CollaborationContext = { userId: string; documentId: string }`; `LOADING_ORIGIN`; `createClientDeclarer(log)`; `services.log`, `services.hocuspocus`; test helpers `connectToDocument({ server, cookie, documentId, document? }): Promise<CollaborationClient>` (`{ document: Y.Doc; provider: HocuspocusProvider; close(): void }`, rejects with `CollaborationRefusedError`), `documentWithOwner(): Promise<{ server: TestServer; documentId: string; owner: TestUser }>`, `memberWithRole({ server, documentId, role }): Promise<TestUser>` (both built on Task 5's `signedInOwner` and `signedInUser`).

- [ ] **Step 1: Failing tests** — `room-name.test.ts` pins the room format observed in the POC and the spike (`sd2/v2.1/awareness`), so a SuperDoc change fails here:
```ts
const DOCUMENT_ID = '0b5c2f9e-6a1d-4c3b-9e8f-1a2b3c4d5e6f';

test('reads the document id from the SuperDoc v2.1 room name and refuses any other shape', () => {
  expect(documentIdFromRoomName(`sd2/v2.1/${DOCUMENT_ID}`)).toBe(DOCUMENT_ID);
  expect([`other/${DOCUMENT_ID}`, `sd2/v2.1/${DOCUMENT_ID}/x`, DOCUMENT_ID, 'sd2/v2.1/probe'].map(documentIdFromRoomName)).toEqual([null, null, null, null]);
});
```
`collaboration-history.test.ts`
```ts
const ALL = Number.MAX_SAFE_INTEGER;

test("a reader's update is acknowledged but never logged", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const reader = await memberWithRole({ server, documentId, role: DocumentRole.Reader });
  const readerClient = await connectToDocument({ server, cookie: reader.cookie, documentId });
  readerClient.document.getText('t').insert(0, 'reader');
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  ownerClient.document.getText('t').insert(0, 'owner');
  await expect.poll(() => server.services.log.hasUpdates(documentId)).toBe(true);
  expect(server.services.log.read({ documentName: documentId, untilSequence: ALL }).map((update) => update.connectionUserId)).not.toContain(reader.id);
  [readerClient, ownerClient].forEach((client) => client.close());
  await server.stop();
});
test('a restarted server restores the room from the log', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('t').insert(0, 'persisted');
  await expect.poll(() => server.services.log.hasUpdates(documentId)).toBe(true);
  client.close();
  await server.stop();
  const restarted = await startTestServer({ databaseDirectory: server.databaseDirectory });
  const reopened = await connectToDocument({ server: restarted, cookie: await signInExisting({ server: restarted, email: owner.email, password: TEST_USER_PASSWORD }), documentId });
  expect(reopened.document.getText('t').toString()).toBe('persisted');
  reopened.close();
  await restarted.stop();
});
```
Also, each input → expected:
- `a member's update is logged with their user id`: the owner inserts `'hello'` → polled `log.read(...).map(connectionUserId)` equals `[owner.id]`.
- `a non-member is refused like a missing session`: a signed-in stranger → `connectToDocument` rejects with `CollaborationRefusedError`.
- `an awareness userId equal to the socket user declares the identity`: `provider.setAwarenessField('userId', owner.id)` then an insert → `identitySources(documentId).get(document.clientID)` polls to `IdentitySource.Declared`; with `'someone-else'` it stays `Observed`.
`testing/collaboration-client.ts` moves `socketWithCookie` out of `collaboration-server.test.ts` and adds:
```ts
export class CollaborationRefusedError extends Error {
  constructor() {
    super('The collaboration server refused the connection.');
  }
}

export function connectToDocument({ server, cookie, documentId, document = new Y.Doc() }: { server: TestServer; cookie: string; documentId: string; document?: Y.Doc }): Promise<CollaborationClient> {
  return new Promise((resolve, reject) => {
    const websocketProvider = new HocuspocusProviderWebsocket({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, WebSocketPolyfill: socketWithCookie({ cookie, origin: server.baseUrl }), maxAttempts: 1 });
    const provider = new HocuspocusProvider({
      websocketProvider,
      document,
      name: `${SUPERDOC_ROOM_PREFIX}${documentId}`,
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      onSynced: () => resolve({ document, provider, close }),
      onAuthenticationFailed: () => {
        close();
        reject(new CollaborationRefusedError());
      },
    });
    function close(): void {
      provider.destroy();
      websocketProvider.destroy();
    }
  });
}
```
`documentWithOwner` starts a test server, signs up a unique owner, creates the document through `services.documents.create`; `memberWithRole` signs up a unique user and calls `services.documents.grant`. The three slice 1 tests in `collaboration-server.test.ts` now connect through `connectToDocument` to a real document (`probe` is no longer a valid room).
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(server): pin socket membership, read-only and the log`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `room-name.ts` (the only place that knows SuperDoc's prefix; a strict shape stops a member from opening `other/<id>`, a second room that would append to the same log)
```ts
export const SUPERDOC_ROOM_PREFIX = 'sd2/v2.1/';
const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function documentIdFromRoomName(roomName: string): string | null {
  if (!roomName.startsWith(SUPERDOC_ROOM_PREFIX)) return null;
  const documentId = roomName.slice(SUPERDOC_ROOM_PREFIX.length);
  if (!DOCUMENT_ID_PATTERN.test(documentId)) return null;
  return documentId;
}
```
`client-declarations.ts` (spike fact 1: the v2 presence record's `userId` is `user.id`, and its `clientId` is one of the socket's `clients`; the signature check skips unchanged sets)
```ts
type PresenceState = { userId?: string };

export function createClientDeclarer(log: UpdateLog) {
  const lastDeclared = new Map<string, string>();
  return {
    declare(document: Document): void {
      const states = document.awareness.getStates() as Map<number, PresenceState>;
      const declarations = [...document.connections.values()].flatMap(({ clients, connection }) => {
        const { userId, documentId } = connection.context as CollaborationContext;
        return [...clients].filter((clientId: number) => states.get(clientId)?.userId === userId).map((clientId: number) => ({ documentName: documentId, yjsClientId: clientId, userId }));
      });
      const signature = JSON.stringify(declarations.map(({ yjsClientId, userId }) => `${yjsClientId}:${userId}`).sort());
      if (lastDeclared.get(document.name) === signature) return;
      lastDeclared.set(document.name, signature);
      declarations.forEach((declaration) => log.declareClientIdentity(declaration));
    },
    forget(documentName: string): void {
      lastDeclared.delete(documentName);
    },
  };
}
```
`collaboration-server.ts`
```ts
export const LOADING_ORIGIN = 'update-log-replay';
const SNAPSHOT_EVERY_UPDATES = 1000;
const STORE_DEBOUNCE_MS = 2000;

export type CollaborationContext = { userId: string; documentId: string };

function requireDocumentId(roomName: string): string {
  const documentId = documentIdFromRoomName(roomName);
  if (!documentId) throw new CollaborationAuthenticationError();
  return documentId;
}

export function createCollaborationServer({ auth, documents, log, onStored }: { auth: Auth; documents: DocumentsRepository; log: UpdateLog; onStored: (documentId: string) => void }): Hocuspocus {
  const declarer = createClientDeclarer(log);
  return new Hocuspocus({
    quiet: true,
    timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
    debounce: STORE_DEBOUNCE_MS,
    async onAuthenticate({ requestHeaders, documentName, connection }): Promise<CollaborationContext> {
      const cookie = requestHeaders.cookie;
      if (!cookie) throw new CollaborationAuthenticationError();
      const user = await readSession({ auth, headers: new Headers({ cookie }) });
      if (!user) throw new CollaborationAuthenticationError();
      const documentId = requireDocumentId(documentName);
      const role = documents.findRole({ documentId, userId: user.id });
      if (!role) throw new CollaborationAuthenticationError();
      if (role === DocumentRole.Reader) connection.readOnly = true;
      return { userId: user.id, documentId };
    },
    async onLoadDocument({ document, documentName }) {
      const restored = materialize({ log, documentName: requireDocumentId(documentName), untilSequence: Number.MAX_SAFE_INTEGER });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(restored), LOADING_ORIGIN);
    },
    async onChange({ update, context, transactionOrigin }) {
      if (transactionOrigin === LOADING_ORIGIN) return;
      const { userId, documentId } = context as CollaborationContext;
      log.append({ documentName: documentId, connectionUserId: userId, update });
    },
    async onStoreDocument({ documentName }) {
      const documentId = requireDocumentId(documentName);
      compact({ log, documentName: documentId, everyUpdates: SNAPSHOT_EVERY_UPDATES });
      onStored(documentId);
    },
    async onAwarenessUpdate({ document }) {
      declarer.declare(document);
    },
    async afterUnloadDocument({ documentName }) {
      declarer.forget(documentName);
    },
  });
}
```
`server.ts`: `const historySqlite = openSqliteFile({ directory, fileName: HISTORY_DATABASE_FILE }); runHistoryMigrations({ sqlite: historySqlite, set: MigrationSet.History }); const log = new UpdateLog(historySqlite);` before the collaboration server; `onStored: (documentId) => documents.touch(documentId)` until Task 7; `stop()` closes `historySqlite` after `hocuspocus.destroy()`.
- [ ] **Step 4: Run, expect pass** — room name (1), collaboration history (5), slice 1 collaboration and attach suites.
- [ ] **Step 5: Commit** — `feat(server): check membership on the socket and log every update`

---

### Task 7: Projection worker, scheduler, runtime and the events route (G2)

**Files:**
- Create: `apps/server/src/history/{projection-messages,projection-worker,projection-scheduler,history-routes}.ts`, `apps/server/src/collaboration/collaboration-runtime.ts`
- Create: `apps/server/src/testing/events-client.ts`
- Modify: `apps/server/src/server.ts`, `apps/server/src/http/app.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/tsup.config.ts`
- Test: `apps/server/src/history/{projection-scheduler,history-routes}.test.ts`

**Interfaces:**
- Consumes: `projectPending`, `findBootstrapSequence`, `ReadModel`, `UpdateLog.clientIdentities`, `resolveAuthorIds`, `StoredEditEvent`, `toImportedRevisions`, `ListedTrackedChange`, `DocumentFileStorage.pathOf`, `requireUser`, `requireDocumentRole`, `DocumentsRepository.userNames`.
- Produces: `ProjectionRequestKind { Project, Import, Forget, Stop }`, `ProjectionRequest` (discriminated union), `ProjectionReply = { kind; documentId; cursor: number | null; importError: string | null }`, `IMPORT_TIMEOUT_MS = 30_000`, `IMPORT_FAILED_MESSAGE = 'Importing Word revisions failed for document'`; `ProjectionScheduler({ databaseDirectory })`: `schedule(documentId)`, `importRevisions({ documentId, filePath })`, `forget(documentId): Promise<void>`, `stop(): Promise<void>`, `currentWorker: Worker`; `DocumentRuntime = { roomMode(documentId): RoomMode; onlineUserIds(documentId): Set<string>; importRevisions(documentId): void; forget(documentId): Promise<void> }` and `createCollaborationRuntime({ hocuspocus, log, readModel, scheduler, storage })`; `createApp({ auth, environment, services })` with `AppServices`, `requireUser` mounted on `/api/documents`, `/api/documents/*` and `/api/share-links/*` only; `NOT_FOUND_MESSAGE` exported from `server.ts`; `GET /api/documents/:id/events?afterSequence=N` → `DocumentEditEvents`; `services.readModel`, `services.scheduler`, `services.runtime`; test helpers in `testing/events-client.ts`: `readEvents({ server, documentId, cookie }): Promise<DocumentEditEvent[]>` (the unwrapped `events` array) and `insertedBy({ events, userId }): string`.

- [ ] **Step 1: Failing tests** — `history-routes.test.ts`
```ts
test("events attribute each author's inserted text", async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const editor = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: ownerClient.document, texts: ['Hello'] });
  commitBootstrap(ownerClient.document);
  writeStory({ document: ownerClient.document, texts: ['Hello A'] });
  const editorClient = await connectToDocument({ server, cookie: editor.cookie, documentId });
  writeStory({ document: editorClient.document, texts: ['Hello A B'] });
  await expect.poll(async () => insertedBy({ events: await readEvents({ server, cookie: owner.cookie, documentId }), userId: editor.id }), { timeout: 15_000 }).toBe(' B');
  expect(insertedBy({ events: await readEvents({ server, cookie: owner.cookie, documentId }), userId: owner.id })).toBe(' A');
  [ownerClient, editorClient].forEach((client) => client.close());
  await server.stop();
});
test('a late declaration corrects the author of an already projected edit', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const ana = await memberWithRole({ server, documentId, role: DocumentRole.Editor });
  const ownerClient = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: ownerClient.document, texts: ['Hello'] });
  commitBootstrap(ownerClient.document);
  const anaOffline = new Y.Doc();
  Y.applyUpdate(anaOffline, Y.encodeStateAsUpdate(ownerClient.document));
  writeStory({ document: anaOffline, texts: ['Hello Ana'] });
  Y.applyUpdate(ownerClient.document, Y.encodeStateAsUpdate(anaOffline));
  const authorsOfAnaText = async () => (await readEvents({ server, cookie: owner.cookie, documentId })).filter((event) => event.inserted === ' Ana').map((event) => event.authors.map((author) => author.id));
  await expect.poll(authorsOfAnaText, { timeout: 15_000 }).toEqual([[owner.id]]);
  const anaClient = await connectToDocument({ server, cookie: ana.cookie, documentId, document: anaOffline });
  anaClient.provider.setAwarenessField('userId', ana.id);
  await expect.poll(authorsOfAnaText).toEqual([[ana.id]]);
  [ownerClient, anaClient].forEach((client) => client.close());
  await server.stop();
});
```
The relay is the POC's relay scenario: the owner's socket carries Ana's struct, so it is first observed as the owner's; Ana's later declaration overrides the observation, and the already projected event is re-attributed without re-projection. Also `afterSequence returns only later events and a non-member gets 404`: with the events above, `?afterSequence=<first event's sequence>` returns every event but the first; `?afterSequence=-1` is 400; a stranger's request is 404 with the same body as a missing document. `projection-scheduler.test.ts`
```ts
test('a terminated worker is restarted and completes without duplicates', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  writeStory({ document: client.document, texts: [''] });
  commitBootstrap(client.document);
  Array.from({ length: 50 }).forEach((_, index) => writeStory({ document: client.document, texts: ['y'.repeat(index + 1)] }));
  await expect.poll(() => server.services.log.readBatch({ documentName: documentId, afterSequence: 0, limit: 100 }).length).toBe(52);
  const firstWorker = server.services.scheduler.currentWorker;
  server.services.scheduler.schedule(documentId);
  await firstWorker.terminate();
  server.services.scheduler.schedule(documentId);
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId })).map((event) => event.inserted).join(''), { timeout: 15_000 }).toBe('y'.repeat(50));
  expect(server.services.scheduler.currentWorker).not.toBe(firstWorker);
  client.close();
  await server.stop();
});
```
Also, each input → expected:
- `scheduling a busy document coalesces into one rerun`: spy `currentWorker.postMessage`, call `schedule` five times before the first reply → exactly two `Project` messages once the reply arrives.
- `a failed import is logged once and leaves the document usable`: spy `console.error`; `services.runtime.importRevisions(documentId)` twice for a document whose file was never stored, then `await services.scheduler.forget(randomUUID())` (the worker answers in order, so both import replies are settled) → exactly one `console.error` call, one string, single line, starting with `` `${IMPORT_FAILED_MESSAGE} ${documentId}: ` ``; `connectToDocument` still syncs; `readEvents` is `[]`.
- `events survive a server restart`: after the two-author test's events exist, `stop()` and `startTestServer({ databaseDirectory })` → `readEvents` returns the same events with the same ids, and a new edit appears once, after them.
- `stop ends the worker cleanly`: `await services.scheduler.stop()` → the worker's `exit` code is `0` and `currentWorker` is not respawned.

`testing/events-client.ts`
```ts
export async function readEvents({ server, documentId, cookie }: { server: TestServer; documentId: string; cookie: string }): Promise<DocumentEditEvent[]> {
  const response = await fetch(`${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Events })}`, { headers: { cookie } });
  if (!response.ok) throw new TestRequestFailedError({ path: DocumentResource.Events, status: response.status });
  const body: DocumentEditEvents = await response.json();
  return body.events;
}

export function insertedBy({ events, userId }: { events: DocumentEditEvent[]; userId: string }): string {
  return events.filter((event) => event.authors.length === 1 && event.authors[0]?.id === userId).map((event) => event.inserted).join('');
}
```
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(server): pin the projection worker and read-time authors`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `projection-messages.ts`
```ts
export const IMPORT_TIMEOUT_MS = 30_000;
export const IMPORT_FAILED_MESSAGE = 'Importing Word revisions failed for document';

export enum ProjectionRequestKind { Project = 'project', Import = 'import', Forget = 'forget', Stop = 'stop' }
export type ProjectionRequest =
  | { kind: ProjectionRequestKind.Project; documentId: string }
  | { kind: ProjectionRequestKind.Import; documentId: string; filePath: string }
  | { kind: ProjectionRequestKind.Forget; documentId: string }
  | { kind: ProjectionRequestKind.Stop };
export type ProjectionReply = { kind: ProjectionRequestKind; documentId: string; cursor: number | null; importError: string | null };
export type ProjectionWorkerData = { databaseDirectory: string };
```
`projection-worker.ts` (opens its own connections: read-only on the log, read-write on the read model; requests run strictly in order on one promise chain, which is the per-document single flight inside the thread; the worker never logs, it reports import errors to the main thread)
```ts
const port = parentPort;
if (!port) throw new ProjectionWorkerContextError();
const { databaseDirectory } = workerData as ProjectionWorkerData;
const historySqlite = new Database(join(databaseDirectory, HISTORY_DATABASE_FILE), { readonly: true });
const readModelSqlite = openSqliteFile({ directory: databaseDirectory, fileName: READ_MODEL_DATABASE_FILE });
const log = new UpdateLog(historySqlite);
const readModel = new ReadModel(readModelSqlite);
let sdkConnection: Promise<SuperDocClient> | null = null;
let queue = Promise.resolve();

async function connectSdk(): Promise<SuperDocClient> {
  const client = new SuperDocClient();
  await client.connect();
  return client;
}

function connectedSdk(): Promise<SuperDocClient> {
  if (!sdkConnection) sdkConnection = connectSdk();
  return sdkConnection;
}

function withTimeout<Value>({ work, milliseconds }: { work: Promise<Value>; milliseconds: number }): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new ImportTimeoutError(milliseconds)), milliseconds);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

async function listRevisions(filePath: string): Promise<ListedTrackedChange[]> {
  const opened = await (await connectedSdk()).open({ doc: filePath });
  const listed = (await opened.trackChanges.list({})) as unknown as { items: ListedTrackedChange[] };
  await opened.close({ discard: true });
  return listed.items;
}

async function importRevisions({ documentId, filePath }: { documentId: string; filePath: string }): Promise<string | null> {
  try {
    const items = await withTimeout({ work: listRevisions(filePath), milliseconds: IMPORT_TIMEOUT_MS });
    readModel.commitImported({ documentName: documentId, revisions: toImportedRevisions(items) });
    return null;
  } catch (error) {
    return String(error).replaceAll('\n', ' ');
  }
}

async function handle(request: Exclude<ProjectionRequest, { kind: ProjectionRequestKind.Stop }>): Promise<ProjectionReply> {
  const { kind, documentId } = request;
  if (request.kind === ProjectionRequestKind.Import) return { kind, documentId, cursor: readModel.cursor(documentId), importError: await importRevisions(request) };
  if (kind === ProjectionRequestKind.Forget) readModel.forget(documentId);
  if (kind === ProjectionRequestKind.Project) return { kind, documentId, cursor: projectPending({ log, readModel, documentName: documentId }), importError: null };
  return { kind, documentId, cursor: readModel.cursor(documentId), importError: null };
}

async function stopWorker(): Promise<void> {
  if (sdkConnection) await sdkConnection.then((client) => client.dispose(), () => undefined);
  historySqlite.close();
  readModelSqlite.close();
  process.exit(0);
}

port.on('message', (request: ProjectionRequest) => {
  if (request.kind === ProjectionRequestKind.Stop) {
    queue = queue.then(stopWorker);
    return;
  }
  queue = queue.then(async () => port.postMessage(await handle(request)));
});
```
`ProjectionWorkerContextError` (`'The projection worker must run in a worker thread.'`) and `ImportTimeoutError` (`` `The import took longer than ${milliseconds} ms.` ``) are declared in `projection-messages.ts`. A timed-out SDK call keeps running in the background, but the queue moves on; the next `Stop` disposes the client.
`projection-scheduler.ts` (main-thread single flight: one in-flight request per document, later requests coalesce into one rerun; a dead worker is replaced and its in-flight work re-posted)
```ts
const SOURCE_EXTENSION = '.ts';
const SOURCE_EXEC_ARGV = ['--import', 'tsx'];

function workerEntry(): { url: URL; execArgv: string[] } {
  if (import.meta.url.endsWith(SOURCE_EXTENSION)) return { url: new URL('./projection-worker.ts', import.meta.url), execArgv: SOURCE_EXEC_ARGV };
  return { url: new URL('./projection-worker.js', import.meta.url), execArgv: [] };
}

export class ProjectionScheduler {
  currentWorker: Worker;
  private readonly databaseDirectory: string;
  private readonly inFlight = new Set<string>();
  private readonly rerun = new Set<string>();
  private readonly forgetting = new Map<string, () => void>();
  private readonly loggedImportFailures = new Set<string>();
  private stopping = false;

  constructor({ databaseDirectory }: { databaseDirectory: string }) {
    this.databaseDirectory = databaseDirectory;
    this.currentWorker = this.spawn();
  }

  schedule(documentId: string): void {
    if (this.inFlight.has(documentId)) {
      this.rerun.add(documentId);
      return;
    }
    this.inFlight.add(documentId);
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Project, documentId });
  }

  forget(documentId: string): Promise<void> {
    return new Promise((resolve) => {
      this.forgetting.set(documentId, resolve);
      this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId });
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const exited = new Promise<void>((resolve) => this.currentWorker.once('exit', () => resolve()));
    this.currentWorker.postMessage({ kind: ProjectionRequestKind.Stop });
    await exited;
  }

  private spawn(): Worker {
    const { url, execArgv } = workerEntry();
    const worker = new Worker(url, { execArgv, workerData: { databaseDirectory: this.databaseDirectory } });
    worker.on('message', (reply: ProjectionReply) => this.settle(reply));
    worker.on('exit', () => this.restart());
    return worker;
  }

  private settle({ kind, documentId, importError }: ProjectionReply): void {
    if (kind === ProjectionRequestKind.Forget) return this.settleForget(documentId);
    if (importError !== null) return this.reportImportFailure({ documentId, importError });
    if (kind !== ProjectionRequestKind.Project) return;
    this.inFlight.delete(documentId);
    if (!this.rerun.delete(documentId)) return;
    this.schedule(documentId);
  }

  private reportImportFailure({ documentId, importError }: { documentId: string; importError: string }): void {
    if (this.loggedImportFailures.has(documentId)) return;
    this.loggedImportFailures.add(documentId);
    console.error(`${IMPORT_FAILED_MESSAGE} ${documentId}: ${importError}`);
  }

  private settleForget(documentId: string): void {
    const resolve = this.forgetting.get(documentId);
    this.forgetting.delete(documentId);
    if (resolve) resolve();
  }

  private restart(): void {
    if (this.stopping) return;
    this.currentWorker = this.spawn();
    const pending = [...this.inFlight];
    this.inFlight.clear();
    pending.forEach((documentId) => this.schedule(documentId));
    [...this.forgetting.keys()].forEach((documentId) => this.currentWorker.postMessage({ kind: ProjectionRequestKind.Forget, documentId }));
  }
}
```
`importRevisions({ documentId, filePath })` posts `{ kind: ProjectionRequestKind.Import, documentId, filePath }` and expects no tracking: a lost import is the spec's "imported events absent" case.
`collaboration-runtime.ts`
```ts
export type DocumentRuntime = { roomMode(documentId: string): RoomMode; onlineUserIds(documentId: string): Set<string>; importRevisions(documentId: string): void; forget(documentId: string): Promise<void> };

export function createCollaborationRuntime({ hocuspocus, log, readModel, scheduler, storage }: { hocuspocus: Hocuspocus; log: UpdateLog; readModel: ReadModel; scheduler: ProjectionScheduler; storage: DocumentFileStorage }): DocumentRuntime {
  const bootstrapped = new Set<string>();
  function roomsOf(documentId: string): Document[] {
    return [...hocuspocus.documents.values()].filter((room) => documentIdFromRoomName(room.name) === documentId);
  }
  function hasCommittedBootstrap(documentId: string): boolean {
    if (bootstrapped.has(documentId)) return true;
    const isProjected = readModel.cursor(documentId) !== null;
    const committed = isProjected || findBootstrapSequence(log.read({ documentName: documentId, untilSequence: Number.MAX_SAFE_INTEGER })) !== null;
    if (committed) bootstrapped.add(documentId);
    return committed;
  }
  return {
    roomMode: (documentId) => (hasCommittedBootstrap(documentId) ? RoomMode.Join : RoomMode.Create),
    onlineUserIds: (documentId) => new Set(roomsOf(documentId).flatMap((room) => [...room.connections.values()].map(({ connection }) => (connection.context as CollaborationContext).userId))),
    importRevisions: (documentId) => scheduler.importRevisions({ documentId, filePath: storage.pathOf(documentId) }),
    forget: async (documentId) => {
      roomsOf(documentId).forEach((room) => hocuspocus.closeConnections(room.name));
      log.forget(documentId);
      bootstrapped.delete(documentId);
      await scheduler.forget(documentId);
    },
  };
}
```
The bootstrap check is cached per process once true; the projection cursor answers it without decoding for any document already projected, so the full-log decode runs at most once per document per process, and only until its bootstrap commits.
`history-routes.ts`: `GET /:documentId/events` behind `requireUser` → `requireDocumentRole(Reader)`; `afterSequence` parsed with `z.coerce.number().int().nonnegative().optional()` (400 when invalid, `null` when absent); authors are resolved at read time from the raw facts and the current identities (one `client_identities` query per request, then an in-memory map), names from one `documents.userNames` call:
```ts
function authorIdsOf({ event, identities }: { event: StoredEditEvent; identities: Map<number, string> }): string[] {
  const { yjsClientIds, connectionUserId } = event;
  if (event.imported) return [];
  if (yjsClientIds === null || connectionUserId === null) throw new IncompleteEditEventError(event.id);
  return resolveAuthorIds({ update: { yjsClientIds, connectionUserId }, identities });
}

function authorsOf({ event, authorIds, names }: { event: StoredEditEvent; authorIds: string[]; names: Map<string, string> }): EventAuthor[] {
  if (event.authorName !== null) return [{ id: null, name: event.authorName }];
  return authorIds.map((id) => {
    const name = names.get(id);
    if (!name) throw new UnknownAuthorError(id);
    return { id, name };
  });
}

function readDocumentEvents({ services, documentId, afterSequence }: { services: AppServices; documentId: string; afterSequence: number | null }): DocumentEditEvents {
  const identities = services.log.clientIdentities(documentId);
  const stored = services.readModel.read({ documentName: documentId, afterSequence });
  const resolved = stored.map((event) => ({ event, authorIds: authorIdsOf({ event, identities }) }));
  const names = services.documents.userNames([...new Set(resolved.flatMap(({ authorIds }) => authorIds))]);
  const events = resolved.map(({ event, authorIds }) => ({ id: event.id, sequence: event.sequence, serverTime: event.serverTime, blockId: event.blockId, kind: event.kind, inserted: event.inserted, deleted: event.deleted, imported: event.imported, authors: authorsOf({ event, authorIds, names }) }));
  return { events, cursor: services.readModel.cursor(documentId) };
}
```
`IncompleteEditEventError` and `UnknownAuthorError` are declared in the same file (users cascade their documents, so an unknown name is a real inconsistency). `app.ts`: `createApp({ auth, environment, services })`; `const signedIn = requireUser({ auth })` is mounted with `app.use(ApiPath.Documents, signedIn)`, ``app.use(`${ApiPath.Documents}/*`, signedIn)`` and ``app.use(`${ApiPath.ShareLinks}/*`, signedIn)`` only, so `/api/health`, `/api/me` and `/api/auth/*` keep their slice 1 behaviour; `app.onError` maps `DocumentNotFoundError` → 404 `{ error: NOT_FOUND_MESSAGE }` (now exported from `server.ts`, the body slice 1's `notFound` uses), `DocumentRoleTooLowError` → 403, and rethrows anything else. `server.ts` order: open and migrate the three files; `UpdateLog`; `ReadModel` on the main-thread read-model handle (reads only; the worker is the only writer); `ProjectionScheduler`; collaboration server with `onStored: (documentId) => { documents.touch(documentId); scheduler.schedule(documentId); }`; runtime (`createCollaborationRuntime({ hocuspocus, log, readModel, scheduler, storage })`); app; `listen`; `attachCollaboration`; `stop()` adds `await scheduler.stop()` and closes the two history handles. `tsup.config.ts`: `entry: { main: 'src/main.ts', seed: 'src/seed.ts', 'projection-worker': 'src/history/projection-worker.ts' }`, `external: ['better-sqlite3', '@superdoc/sdk']`, `noExternal: ['@superdoc-history/types', '@superdoc-history/history']`.
- [ ] **Step 4: Run, expect pass** — then `pnpm --filter @superdoc-history/server build && test -f apps/server/dist/projection-worker.js`.
- [ ] **Step 5: Commit** — `feat(server): project edit events in a worker and serve them`

---

### Task 8: Document routes: list, create, upload, open, rename, delete, download, members (G2)

**Files:**
- Create: `apps/server/src/documents/documents-routes.ts`
- Modify: `apps/server/src/http/app.ts` (mount), `apps/server/src/server.ts`, `apps/server/src/testing/test-server.ts`
- Test: `apps/server/src/documents/documents-routes.test.ts`

**Interfaces:**
- Consumes: `DocumentsRepository`, `DocumentFileStorage`, `DocumentRuntime`, `requireUser`, `requireDocumentRole`, `isDocx`, `buildSeedDocx`.
- Produces: `createDocumentsRoutes(services: AppServices): Hono<SignedIn>` serving the spec's interfaces at `ApiPath.Documents`.

- [ ] **Step 1: Failing tests**
```ts
async function upload({ server, cookie, bytes, type = DOCX_MIME_TYPE }: { server: TestServer; cookie: string; bytes: Uint8Array; type?: string }): Promise<Response> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, new File([bytes], 'Plan.docx', { type }));
  return fetch(`${server.baseUrl}${ApiPath.Documents}`, { method: HttpMethod.Post, headers: { cookie }, body: form });
}

async function listOf({ server, cookie }: { server: TestServer; cookie: string }): Promise<DocumentsList> {
  return (await fetch(`${server.baseUrl}${ApiPath.Documents}`, { headers: { cookie } })).json();
}

test('rejects a zip without word/document.xml', async () => {
  const { server, owner } = await signedInOwner();
  const zip = new JSZip();
  zip.file('notes.txt', 'renamed zip');
  expect((await upload({ server, cookie: owner.cookie, bytes: await zip.generateAsync({ type: 'uint8array' }) })).status).toBe(HttpStatus.UnsupportedMediaType);
  expect((await listOf({ server, cookie: owner.cookie })).mine).toEqual([]);
  expect(readdirSync(join(server.databaseDirectory, DOCUMENT_FILES_DIRECTORY), { withFileTypes: true }).length).toBe(0);
  await server.stop();
});
test('two uploads of the same file create two documents', async () => {
  const { server, owner } = await signedInOwner();
  const other = await signedInUser({ server, name: 'Bruno' });
  const bytes = await buildSeedDocx([{ text: 'Same', trackedChanges: [] }]);
  const first: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes })).json();
  const second: DocumentSummary = await (await upload({ server, cookie: other.cookie, bytes })).json();
  expect(first.id).not.toBe(second.id);
  expect((await listOf({ server, cookie: other.cookie })).mine.map((document) => document.id)).toEqual([second.id]);
  await server.stop();
});
test('imported Word revisions appear in the events with the revision author', async () => {
  const { server, owner } = await signedInOwner();
  const bytes = await buildSeedDocx([{ text: 'Preamble by', trackedChanges: [{ kind: TrackedChangeKind.Insert, author: 'Chris Crawford', date: '2026-02-12T09:01:00Z', text: ' developers' }] }]);
  const created: DocumentSummary = await (await upload({ server, cookie: owner.cookie, bytes })).json();
  await expect.poll(async () => (await readEvents({ server, cookie: owner.cookie, documentId: created.id })).map((event) => [event.imported, event.authors, event.inserted]), { timeout: 30_000 }).toEqual([[true, [{ id: null, name: 'Chris Crawford' }], ' developers']]);
  await server.stop();
});
```
The rejection test creates the `documents` directory first (`mkdirSync`, recursive) so `readdirSync` counts zero files. Also in this file, each input → expected:
- `an uploaded document is listed as mine and downloads the original bytes`: `Plan.docx` → title "Plan", `mine` holds its id, the download equals the uploaded bytes.
- `a body over the limit is 413 before parsing`: a 12 MB body → 413, `services.storage` holds nothing.
- `a file of exactly 10 MB is not refused for its size`: 10 MB of zeros → 415, not 413. `a file without the DOCX mime is 415`: a valid docx sent as `text/plain` → 415.
- `a non-member gets the same 404 as a missing document`: status and body equal for a foreign id and a random uuid on GET, PATCH, DELETE, download, members and events.
- `rename by an editor works and a reader gets 403`: editor `PATCH { title: '  New  ' }` → 200 and the stored title is `New`; reader → 403.
- `a blank or whitespace title is refused`: `PATCH { title: '' }` and `{ title: '   ' }` → 400, the stored title unchanged.
- `roomMode stays create until the bootstrap commits`: an owner client writes `writeStory` only (the log has updates, no `meta.bootstrapState === 'committed'`) → `GET /:id` says `create`; after `commitBootstrap` and `log.hasUpdates` → `join`.
- `a reader opening a never-created room gets 409 NOT_READY`: fresh document, reader member → 409 `{ error: DOCUMENT_NOT_READY_ERROR }`; an editor on the same document → 200 with `roomMode: 'create'`; after the bootstrap commits, the reader → 200 with `join`.
- `download names the file with an ASCII fallback and an RFC 5987 filename*`: title `Q3 "final" (draft)'s plan*` → `content-disposition` is exactly `attachment; filename="Q3 _final_ (draft)'s plan*.docx"; filename*=UTF-8''Q3%20%22final%22%20%28draft%29%27s%20plan%2A.docx`.
- `members marks the connected owner online`; `signed-out requests get 401`; `a blank document downloads a valid docx` (`isDocx` true).
- `delete removes the row, the file, the log and the events, and closes the room`: the owner connects through `connectToDocument`, writes, waits for `log.hasUpdates`, DELETEs (204) → `GET` 404, `storage.read` rejects, `log.hasUpdates` false, `readModel.cursor` null, the provider's `close` fires.
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(server): pin upload, download, rename and delete`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — the create route; every other route is `requireDocumentRole` then one repository, storage or runtime call:
```ts
const MULTIPART_ENVELOPE_BYTES = 64 * 1024;
const MULTIPART_CONTENT_TYPE = 'multipart/form-data';
const BLANK_DOCUMENT: SeedParagraph[] = [{ text: '', trackedChanges: [] }];

function titleFromFileName(fileName: string): string {
  const title = basename(fileName, DOCX_EXTENSION).trim();
  if (!title) return UNTITLED_DOCUMENT_TITLE;
  return title;
}

routes.post('/', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + MULTIPART_ENVELOPE_BYTES, onError: (context) => context.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge) }), async (context) => {
  const isUpload = context.req.header('content-type')?.startsWith(MULTIPART_CONTENT_TYPE) === true;
  if (!isUpload) return createBlank(context);
  const file = (await context.req.parseBody())[UPLOAD_FIELD];
  if (!(file instanceof File)) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
  if (file.size > MAX_UPLOAD_BYTES) return context.json({ error: UPLOAD_TOO_LARGE_MESSAGE }, HttpStatus.PayloadTooLarge);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isAcceptedDocx = file.type === DOCX_MIME_TYPE && (await isDocx(bytes));
  if (!isAcceptedDocx) return context.json({ error: NOT_A_DOCX_MESSAGE }, HttpStatus.UnsupportedMediaType);
  return storeDocument({ context, bytes, title: titleFromFileName(file.name), importRevisions: true });
});

async function storeDocument({ context, bytes, title, importRevisions }: { context: Context<SignedIn>; bytes: Uint8Array; title: string; importRevisions: boolean }): Promise<Response> {
  const documentId = randomUUID();
  const userId = context.var.user.id;
  await storage.put({ documentId, bytes });
  documents.create({ id: documentId, title, ownerUserId: userId });
  if (importRevisions) runtime.importRevisions(documentId);
  return context.json(documents.summary({ documentId, userId }), HttpStatus.Created);
}
```
`createBlank` parses `titleSchema` (400 when invalid) and calls `storeDocument({ context, bytes: await buildSeedDocx(BLANK_DOCUMENT), title, importRevisions: false })`. `bodyLimit` (from `hono/body-limit`) checks `Content-Length` and counts streamed bytes before `parseBody` buffers; the envelope allowance covers multipart boundaries and the post-parse `file.size` check keeps the limit exact. Opening and downloading:
```ts
const RFC_5987_RESERVED = /['()*]/g;
const UNSAFE_IN_QUOTED_FILENAME = /[^\x20-\x7e]|["\\]/g;
const ASCII_FALLBACK_CHARACTER = '_';

function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(UNSAFE_IN_QUOTED_FILENAME, ASCII_FALLBACK_CHARACTER);
  const encoded = encodeURIComponent(fileName).replace(RFC_5987_RESERVED, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

routes.get('/:documentId', (context) => {
  const documentId = context.req.param('documentId');
  const userId = context.var.user.id;
  const role = requireDocumentRole({ documents, documentId, userId, minimumRole: DocumentRole.Reader });
  const roomMode = runtime.roomMode(documentId);
  const mustWaitForCreator = roomMode === RoomMode.Create && role === DocumentRole.Reader;
  if (mustWaitForCreator) return context.json({ error: DOCUMENT_NOT_READY_ERROR }, HttpStatus.Conflict);
  return context.json({ document: documents.summary({ documentId, userId }), role, roomMode });
});
```
Only the owner and editors may create a room; a reader waits for the first editing open. Remaining routes: `GET /` → `documents.list`; `PATCH /:documentId` (Editor) → `titleSchema` → `rename` → summary; `DELETE /:documentId` (Owner) → `await runtime.forget(id)`, `await storage.remove(id)`, `documents.remove(id)`, 204; `GET /:documentId/download` (Reader) → `new Response(await storage.read(id), { headers: { 'content-type': DOCX_MIME_TYPE, 'content-disposition': contentDisposition(title + DOCX_EXTENSION) } })`; `GET /:documentId/members` (Reader) → `{ members: documents.members(id).map((member) => ({ ...member, online: online.has(member.user.id) })) }` with `online = runtime.onlineUserIds(id)`. Mount with `app.route(ApiPath.Documents, createDocumentsRoutes(services))`; `requireUser` already guards the prefix (Task 7).
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit** — `feat(server): add document upload, download, rename and delete`

---

### Task 9: Share links and accept (G2)

**Files:**
- Create: `apps/server/src/documents/{share-links,share-links-routes}.ts`
- Modify: `apps/server/src/http/app.ts`, `apps/server/src/server.ts`, `apps/server/src/testing/test-server.ts`
- Test: `apps/server/src/documents/{share-links,share-links-routes}.test.ts`

**Interfaces:**
- Consumes: `DocumentsRepository.grant`, `SHARE_LINK_GRANTS`, `environment.authSecret`, `environment.appOrigin`.
- Produces: `deriveShareToken({ secret, nonce }): string`, `hashShareToken(token): string`; `ShareLinksRepository({ database, secret, appOrigin })`: `links(documentId): ShareLinks`, `rotate({ documentId, role }): ShareLinks`, `resolve(token): { documentId: string; role: ShareLinkRole } | null`; routes `GET /api/documents/:id/share-links` (Owner), `POST /api/documents/:id/share-links/:role/rotate` (Owner), `POST /api/share-links/:token/accept` → `AcceptedShareLink` or 404 `{ error: INVALID_SHARE_LINK_MESSAGE }`; `services.shareLinks`.

- [ ] **Step 1: Failing tests** — `share-links-routes.test.ts`
```ts
test('rotation invalidates the link but keeps recorded roles', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const bruno = await signedInUser({ server, name: 'Bruno' });
  const caio = await signedInUser({ server, name: 'Caio' });
  const before = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  expect((await accept({ server, cookie: bruno.cookie, url: before[ShareLinkRole.Edit] })).status).toBe(HttpStatus.Ok);
  await rotate({ server, cookie: owner.cookie, documentId, role: ShareLinkRole.Edit });
  expect((await accept({ server, cookie: caio.cookie, url: before[ShareLinkRole.Edit] })).status).toBe(HttpStatus.NotFound);
  await accept({ server, cookie: bruno.cookie, url: before[ShareLinkRole.Read] });
  expect(server.services.documents.findRole({ documentId, userId: bruno.id })).toBe(DocumentRole.Editor);
  await server.stop();
});
test('a token for a deleted document is no longer valid', async () => {
  const { server, documentId, owner } = await blankDocumentWithOwner();
  const bruno = await signedInUser({ server, name: 'Bruno' });
  const links = await shareLinksOf({ server, cookie: owner.cookie, documentId });
  await fetch(`${server.baseUrl}${documentApiPath({ documentId })}`, { method: HttpMethod.Delete, headers: { cookie: owner.cookie } });
  const response = await accept({ server, cookie: bruno.cookie, url: links[ShareLinkRole.Read] });
  expect([response.status, await response.json()]).toEqual([HttpStatus.NotFound, { error: INVALID_SHARE_LINK_MESSAGE }]);
  await server.stop();
});
```
Helpers in the file: `blankDocumentWithOwner` (POST JSON `{ title }`), `shareLinksOf` (GET), `rotate` (POST), `accept` (token = `new URL(url).pathname.split('/').at(-1)`, POST `shareLinkAcceptPath(token)`). Also, each input → expected:
- `a reader who accepts the edit link becomes an editor`: `findRole` → editor.
- `the owner accepting their own link stays owner`: the owner POSTs accept for both URLs → 200 each, `findRole` → owner.
- `the same links come back on every GET until rotated`: two GETs → identical `{ edit, read }`.
- `rotating the edit link leaves the read URL unchanged`: rotate edit → a new edit URL, the read URL byte-identical to before.
- `rotating with role owner is 400`: `POST …/share-links/owner/rotate` → 400, both links unchanged.
- `share-links is 404 for a non-member and 403 for an editor`; `accept without a session is 401`. `share-links.test.ts`: one nonce and secret derive the same token twice; two nonces derive different tokens; `hashShareToken` is 64 hex characters and differs from the token.
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(server): pin share links, rotation and accept`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `share-links.ts`
```ts
const NONCE_BYTES = 32;
const TOKEN_DIGEST = 'sha256';
const SHARE_PATH_PREFIX = '/share/';

export function deriveShareToken({ secret, nonce }: { secret: string; nonce: string }): string {
  return createHmac(TOKEN_DIGEST, secret).update(nonce).digest('base64url');
}

export function hashShareToken(token: string): string {
  return createHash(TOKEN_DIGEST).update(token).digest('hex');
}

export class ShareLinksRepository {
  links(documentId: string): ShareLinks {
    const existing = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.documentId, documentId)).all();
    const missing = Object.values(ShareLinkRole).filter((role) => !existing.some((row) => row.role === role));
    if (missing.length > 0) {
      missing.forEach((role) => this.writeNonce({ documentId, role }));
      return this.links(documentId);
    }
    return Object.fromEntries(existing.map((row) => [row.role, `${this.appOrigin}${SHARE_PATH_PREFIX}${deriveShareToken({ secret: this.secret, nonce: row.nonce })}`])) as ShareLinks;
  }

  rotate({ documentId, role }: { documentId: string; role: ShareLinkRole }): ShareLinks {
    this.writeNonce({ documentId, role });
    return this.links(documentId);
  }

  resolve(token: string): { documentId: string; role: ShareLinkRole } | null {
    const tokenHash = hashShareToken(token);
    const row = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.tokenHash, tokenHash)).get();
    if (!row) return null;
    if (!timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(tokenHash))) return null;
    return { documentId: row.documentId, role: row.role };
  }

  private writeNonce({ documentId, role }: { documentId: string; role: ShareLinkRole }): void {
    const nonce = randomBytes(NONCE_BYTES).toString('base64url');
    const tokenHash = hashShareToken(deriveShareToken({ secret: this.secret, nonce }));
    this.database.drizzle.insert(documentShareLinks).values({ documentId, role, nonce, tokenHash, createdAt: new Date() })
      .onConflictDoUpdate({ target: [documentShareLinks.documentId, documentShareLinks.role], set: { nonce, tokenHash } }).run();
  }
}
```
The constructor takes `{ database, secret, appOrigin }` into three `private readonly` fields, the `DocumentsRepository` way. `share-links-routes.ts`: the two owner routes are mounted on the documents prefix behind `requireDocumentRole(Owner)`; `:role` is parsed with `z.enum(ShareLinkRole)` (400 otherwise). The accept route is `POST /api/share-links/:token/accept`, guarded by the `requireUser` mount on `/api/share-links/*` (Task 7): `resolve(token)`; `null` → 404 `{ error: INVALID_SHARE_LINK_MESSAGE }`; else `documents.grant({ documentId, userId, role: SHARE_LINK_GRANTS[role] })` and `{ documentId }`. A deleted document cascades its link rows, so its tokens resolve to `null`. No route logs a token.
- [ ] **Step 4: Run, expect pass** — then the whole server suite.
- [ ] **Step 5: Commit** — `feat(server): add rotatable edit and read share links`

---

### Task 10: Documents list, upload and new document (G3)

**Files:**
- Create: `apps/web/src/features/documents/{documents-page,document-table,upload-dialog,new-document-button}.tsx`, `apps/web/src/features/documents/{documents-api,use-documents}.ts`, `apps/web/src/components/ui/{table,dialog,badge}.tsx` (`pnpm dlx shadcn@4.21.5 add table dialog badge`)
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/app/router.tsx`; delete `apps/web/src/routes/documents-page.tsx`
- Test: `apps/web/src/features/documents/{documents-page,upload-dialog}.test.tsx`

**Interfaces:**
- Consumes: Task 1 contracts.
- Produces: `apiGet(path: string)`, `apiSend({ path, method, body }: { path: string; method: HttpMethod; body: BodyInit | null }): Promise<Response>`, `ApiRequestError`; `DOCUMENTS_QUERY_KEY = ['documents']`; `useDocuments()`; `uploadDocument(file): Promise<DocumentSummary>`; `createBlankDocument(title): Promise<DocumentSummary>`; `validateUpload(file): string | null`.

- [ ] **Step 1: Failing tests** — `upload-dialog.test.tsx`
```tsx
test('a file over 10 MB shows the limit and sends nothing', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(<UploadDialog />);
  await userEvent.click(screen.getByRole('button', { name: 'Upload .docx' }));
  await userEvent.upload(screen.getByLabelText('Document file'), new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'big.docx', { type: DOCX_MIME_TYPE }));
  expect(await screen.findByRole('alert')).toHaveTextContent(UPLOAD_TOO_LARGE_MESSAGE);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```
Same file: a `.pdf` shows `NOT_A_DOCX_MESSAGE` and sends nothing; a 415 response shows `NOT_A_DOCX_MESSAGE`; a 201 closes the dialog and navigates to `documentPagePath(id)`. `documents-page.test.tsx`: `{ mine: [], shared: [] }` shows "No documents yet" and "Nothing shared with you yet"; one `mine` row shows title, owner name, formatted date and role; a row click navigates to `documentPagePath(id)`; "New document" POSTs `{ title: UNTITLED_DOCUMENT_TITLE }`, invalidates `DOCUMENTS_QUERY_KEY` and navigates.
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(web): pin the documents list and the upload dialog`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — `documents-api.ts`
```ts
export const DOCUMENTS_QUERY_KEY = ['documents'];

export function validateUpload(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(DOCX_EXTENSION)) return NOT_A_DOCX_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_TOO_LARGE_MESSAGE;
  return null;
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  const form = new FormData();
  form.set(UPLOAD_FIELD, file);
  const response = await apiSend({ path: ApiPath.Documents, method: HttpMethod.Post, body: form });
  if (response.status === HttpStatus.PayloadTooLarge) throw new ApiRequestError(UPLOAD_TOO_LARGE_MESSAGE);
  if (response.status === HttpStatus.UnsupportedMediaType) throw new ApiRequestError(NOT_A_DOCX_MESSAGE);
  if (!response.ok) throw new ApiRequestError(`Upload failed with status ${response.status}`);
  return response.json();
}
```
`api.ts`: `apiGet` widens to `string`; `apiSend` calls `fetch(path, { method, body, credentials: 'same-origin' })` and adds `content-type: application/json` only when `body` is a string. `upload-dialog.tsx`: shadcn `Dialog` with a labelled file input (`accept=".docx"`), `validateUpload` on change, `useMutation(uploadDocument)` whose `onSuccess` runs `queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY })` then navigates; errors render in `role="alert"`. `document-table.tsx`: shadcn `Table` (Title, Owner, Updated via `Intl.DateTimeFormat` with `dateStyle: 'medium', timeStyle: 'short'`, My role), an empty row with the given empty message, the table wrapped in `overflow-x-auto` for 375 px. `documents-page.tsx` keeps the slice 1 header (name + sign-out) and renders "Mine" and "Shared with me" with the two buttons. `router.tsx` imports it from `@/features/documents/documents-page`. Tokens only (ADR 0009), no raw colours.
- [ ] **Step 4: Run, expect pass** — `pnpm --filter @superdoc-history/web test:unit`.
- [ ] **Step 5: Commit** — `feat(web): add the documents list with upload and new document`

---

### Task 11: Editor page, sharing dialog and share landing (G3)

**Files:**
- Modify: `apps/web/vite.config.ts`, `apps/web/src/app/router.tsx` (dependencies already installed by Task 1)
- Create: `apps/web/src/features/editor/{document-page,superdoc-editor,editor-header,members,share-dialog,timeline-panel-placeholder}.tsx`, `apps/web/src/features/editor/{use-opened-document,use-editor-setup}.ts`, `apps/web/src/features/sharing/share-landing-page.tsx`, `apps/web/public/blank.docx`
- Test: `apps/web/src/features/editor/{editor-header,share-dialog,document-page}.test.tsx`, `apps/web/src/features/sharing/share-landing-page.test.tsx`

**Interfaces:**
- Consumes: `OpenedDocument`, `DocumentMembers`, `ShareLinks`, `AcceptedShareLink`, `COLLABORATION_TOKEN_PLACEHOLDER`, `RoomMode`, `DocumentRole`, `READ_ONLY_BADGE_LABEL`, `LINK_COPIED_MESSAGE`, `DOCUMENT_UNAVAILABLE_MESSAGE`, `DOCUMENT_NOT_READY_ERROR`, `DOCUMENT_NOT_READY_MESSAGE`.
- Produces: routes `AppRoute.Document` and `AppRoute.Share` inside `RequireSession`; `SuperDocEditor({ documentId, roomMode, role, user, file })`; `useOpenedDocument(documentId)` with query key `['documents', documentId]`; `useEditorSetup({ opened, user, file }): EditorSetup | null` with `EditorSetup = { roomMode; role; user; file }`, captured once per page load; `BLANK_DOCX_PATH = '/blank.docx'`.

- [ ] **Step 1: Failing tests** — `editor-header.test.tsx`
```tsx
test('a reader sees the read-only badge and neither Delete nor Share', () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} />);
  expect(screen.getByText(READ_ONLY_BADGE_LABEL)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Plan' })).toBeVisible();
});
```
Same file: an editor renames on Enter and exactly one PATCH carries `{ title }`; the owner deletes after confirming, DELETE is sent and the page navigates to `/documents`; an online member renders a dot with `aria-label="online"`. `share-dialog.test.tsx`: opening GETs the links and shows both URLs; Copy writes the URL to `navigator.clipboard` and shows `LINK_COPIED_MESSAGE`; Rotate on the edit row POSTs `…/share-links/edit/rotate` and shows the new URL. `share-landing-page.test.tsx`: a 200 accept navigates to `documentPagePath(documentId)` with `replace`; a 404 shows `INVALID_SHARE_LINK_MESSAGE` and a link to `/documents`; the accept POST is sent once under `StrictMode`. `document-page.test.tsx` (with `vi.mock('superdoc')` exposing a spied `SuperDoc` constructor and `destroy`):
```tsx
test('a title rename does not re-create the editor', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner), renamedTitle: 'Renamed' });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const title = screen.getByRole('textbox', { name: 'Title' });
  await userEvent.clear(title);
  await userEvent.type(title, 'Renamed{Enter}');
  await screen.findByDisplayValue('Renamed');
  expect(SuperDoc).toHaveBeenCalledTimes(1);
  expect(superDocDestroy).not.toHaveBeenCalled();
});
```
Same file: a 409 `{ error: DOCUMENT_NOT_READY_ERROR }` shows `DOCUMENT_NOT_READY_MESSAGE` and never constructs `SuperDoc`; a 404 shows `DOCUMENT_UNAVAILABLE_MESSAGE` with a link to `/documents`; `roomMode: 'join'` fetches `BLANK_DOCX_PATH`, never the download URL.
- [ ] **Step 2: Run, expect failure.** Commit the failing tests alone: `test(web): pin the editor header, sharing and the share landing`; `git show` of that commit plus this failing run is the red evidence.
- [ ] **Step 3: Implement** — generate the joiners' blank once: `pnpm --filter @superdoc-history/history exec tsx -e "import('./src/seed-docx.ts').then(async ({ buildSeedDocx }) => (await import('node:fs')).writeFileSync('../../apps/web/public/blank.docx', await buildSeedDocx([{ text: '', trackedChanges: [] }])))"` and commit the file. `superdoc-editor.tsx`
```tsx
const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const READER_DOCUMENT_MODE = 'viewing';
const EDITOR_DOCUMENT_MODE = 'editing';
const HTTP_SCHEME = /^http/;

type SuperDocEditorProps = { documentId: string; roomMode: RoomMode; role: DocumentRole; user: SessionUser; file: Blob };

function collaborationUrl(): string {
  return `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${ApiPath.Collaboration}`;
}

export function SuperDocEditor({ documentId, roomMode, role, user, file }: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      selector: container,
      documentMode: role === DocumentRole.Reader ? READER_DOCUMENT_MODE : EDITOR_DOCUMENT_MODE,
      documents: [{ id: documentId, type: DOCX_MIME_TYPE, data: file, v2Collaboration: { providerType: HOCUSPOCUS_PROVIDER, documentId, serverUrl: collaborationUrl(), roomMode, token: COLLABORATION_TOKEN_PLACEHOLDER } }],
      user: { id: user.id, name: user.name, email: user.email },
    });
    return () => superdoc.destroy();
  }, [documentId, roomMode, role, user, file]);
  return <div ref={containerRef} data-testid="document-editor" className="min-h-0 flex-1 overflow-auto" />;
}
```
From the spike: `user.id` is always passed, or SuperDoc falls back to the email as awareness `userId` (fact 1); readers always get `documentMode: 'viewing'`, because the server's refusal alone leaves a silently diverging local editor, and the `READ_ONLY_BADGE_LABEL` badge comes from `opened.role`, since SuperDoc emits no read-only signal (fact 3); `file` is the stored file from the download endpoint only for `RoomMode.Create` (an upload's original, or the stored blank of a new document), and `fetch(BLANK_DOCX_PATH)` for `RoomMode.Join`, never the real file and never an empty blob (fact 2). `use-editor-setup.ts` captures what SuperDoc is built from once per page load, so refetches and invalidations (a rename, a members poll) never re-create the editor; a role change needs a reload (spike fact 3):
```ts
export function useEditorSetup({ opened, user, file }: { opened: OpenedDocument | undefined; user: SessionUser | null; file: Blob | undefined }): EditorSetup | null {
  const [setup, setSetup] = useState<EditorSetup | null>(null);
  useEffect(() => {
    const canCapture = setup === null && opened !== undefined && user !== null && file !== undefined;
    if (!canCapture) return;
    setSetup({ roomMode: opened.roomMode, role: opened.role, user, file });
  }, [setup, opened, user, file]);
  return setup;
}
```
`document-page.tsx`: `useOpenedDocument` (404 → `DOCUMENT_UNAVAILABLE_MESSAGE` with a link to `/documents`; 409 `DOCUMENT_NOT_READY_ERROR` → `DOCUMENT_NOT_READY_MESSAGE`), `useSession`, the file query keyed by `[documentId, roomMode]` and enabled once the first `roomMode` is known, `useEditorSetup`, and `SuperDocEditor` rendered from the captured setup only, members `useQuery` with `refetchInterval: MEMBERS_REFRESH_MS` (5000), layout `flex h-dvh flex-col` → `EditorHeader` → `flex min-h-0 flex-1` holding `SuperDocEditor` and `TimelinePanelPlaceholder` (a collapsible `aside` showing `TIMELINE_PLACEHOLDER_MESSAGE`, collapsed below `md`). `editor-header.tsx`: the title is an input for owner and editor (PATCH on Enter or blur when changed, then `invalidateQueries` for `DOCUMENTS_QUERY_KEY`), a heading for readers; `Members` (initials and an online dot); `Badge` `READ_ONLY_BADGE_LABEL` for readers; Share (owner) opens `ShareDialog`; "Download .docx" is `<a href={documentApiPath({ documentId, resource: DocumentResource.Download })} download>`; Delete (owner) confirms in a `Dialog`, DELETEs, invalidates, navigates to `AppRoute.Documents`. `share-landing-page.tsx` POSTs `shareLinkAcceptPath(token)` once (a ref guards StrictMode's double effect). `vite.config.ts`: `build: { outDir: 'dist', target: 'esnext' }`, `optimizeDeps: { esbuildOptions: { target: 'esnext' } }`.
- [ ] **Step 4: Run, expect pass** — unit tests; `pnpm --filter @superdoc-history/web build` succeeds and `dist/blank.docx` exists.
- [ ] **Step 5: Commit** — `feat(web): add the collaborative editor page and sharing`

---

### Task 12: End-to-end specs (G4)

**Files:**
- Create: `e2e/documents.spec.ts`, `e2e/collaboration.spec.ts`, `e2e/editor.ts`
- Modify: `e2e/fixtures.ts`, `playwright.config.ts` (test timeout `120_000`; the temporary directory is also exported as `process.env.E2E_DATABASE_DIR` for the identity check)

**Interfaces:**
- Consumes: seeded `DEMO_USERS`, `buildSeedDocx` (`../libs/history/src`), every route above.
- Produces: `signedInContext({ browser, user }): Promise<{ context; page; userId }>` (own `x-forwarded-for`, signs in, reads the id from `/api/me`); `uploadSeed({ page, paragraphs }): Promise<string>` (through the dialog, returns the id from the URL); `shareAndAccept({ owner, member, documentId, role })`; `typeInParagraph({ page, paragraphText, text })` (focus-verified port of the POC helper); `readEditorText(page)` (joins `.superdoc-text-run` texts); `readEvents({ page, documentId })`; `insertedBy({ events, userId })`; `expectEveryCharacterAccounted({ events, initialLength, finalLength })`.

- [ ] **Step 1: Specs** — `collaboration.spec.ts`
```ts
test('two authors converge and each marker is attributed to its author', async ({ browser }) => {
  const ana = await signedInContext({ browser, user: DEMO_USERS[0]! });
  const bruno = await signedInContext({ browser, user: DEMO_USERS[1]! });
  const documentId = await uploadSeed({ page: ana.page, paragraphs: ['Paragraph owned by ana.', 'Paragraph owned by bruno.'] });
  await shareAndAccept({ owner: ana.page, member: bruno.page, documentId, role: ShareLinkRole.Edit });
  const markers = [' <ANA-T2>', ' <BRUNO-T2>'];
  const initialLength = (await readEditorText(ana.page)).length;
  await Promise.all([
    typeInParagraph({ page: ana.page, paragraphText: 'owned by ana', text: markers[0]! }),
    typeInParagraph({ page: bruno.page, paragraphText: 'owned by bruno', text: markers[1]! }),
  ]);
  const finalLength = initialLength + markers.join('').length;
  await expect.poll(async () => {
    const [anaText, brunoText] = await Promise.all([readEditorText(ana.page), readEditorText(bruno.page)]);
    return anaText === brunoText && anaText.length === finalLength;
  }, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => {
    const events = await readEvents({ page: ana.page, documentId });
    return [insertedBy({ events, userId: ana.userId }), insertedBy({ events, userId: bruno.userId })];
  }, { timeout: 30_000 }).toEqual(markers);
  expectEveryCharacterAccounted({ events: (await readEvents({ page: ana.page, documentId })).filter((event) => !event.imported), initialLength, finalLength });
});
```
Same file: `identities are declared from awareness` opens `E2E_DATABASE_DIR/history.sqlite` with better-sqlite3 (`new Database(path, { readonly: true })`, root devDependency from Task 1) after the typing above and expects every `client_identities` row of the document whose `user_id` is Ana's or Bruno's to have `source = 'declared'` (the spike's regression test for fact 1). `documents.spec.ts`: `upload, open, type and the events attribute the text to me` (`setInputFiles({ name: 'Plan.docx', mimeType: DOCX_MIME_TYPE, buffer })`, type `' <MINE>'`, poll until `insertedBy(me) === ' <MINE>'`); `a reader cannot type but sees live edits` (the reader clicks a paragraph and types `READER`; then the owner types `' <AFTER>'`; the reader's page shows `<AFTER>` live, without reload, which proves the reader still receives edits; at that point neither page contains `READER`, `/events` holds no event by the reader, and `READ_ONLY_BADGE_LABEL` is visible; spike fact 3); `a reader waits until the room exists` (the owner creates a blank document with `page.request.post` and never opens it; the reader accepts the read link and sees `DOCUMENT_NOT_READY_MESSAGE` with no editor; the owner opens the document and the editor becomes ready; the reader reloads and gets the editor with `READ_ONLY_BADGE_LABEL`); `a share link adds the document to Shared with me` (accept through `/share/<token>` lands on `/documents/<id>`, the list shows it with role editor); `an invalid share link says so` (`/share/nope` → `INVALID_SHARE_LINK_MESSAGE`); `rename persists after reload`; `delete removes the document for everyone` (the member has it open; after the owner deletes, the member's reload shows `DOCUMENT_UNAVAILABLE_MESSAGE` and the list no longer lists it). Every UI string the specs assert comes from `libs/types`, never a literal.
- [ ] **Step 2: Run** — `pnpm test:e2e` twice in a row; every spec passes both times with `retries: 0`.
- [ ] **Step 3: Commit** — `test(e2e): cover documents, sharing, read-only and two-author attribution`

---

### Task 13: Docker, README and tester briefing (G4)

**Files:**
- Modify: `docker/Dockerfile`, `README.md`, `docs/features/README.md` (status → Building)
- Create: `docs/features/documents-and-history/tester-briefing.md`

- [ ] **Step 1: Dockerfile** — the runtime stage adds `COPY --from=build /workspace/libs/history/drizzle ./libs/history/drizzle` (found by `findMigrationsFolder` walking up from `/app/dist`). Verify: `docker compose up --build -d`; `curl -f localhost:3000/api/health`; sign in with curl; POST a blank document → 201; `docker compose exec app ls /data/documents` lists one `.docx`; `docker compose down -v`.
- [ ] **Step 2: README** — the documents and sharing flow; where data lives (`DATABASE_DIR/{auth,history,read-model}.sqlite`, `DATABASE_DIR/documents/<id>.docx`); the editor needs `pnpm build` plus the server (SuperDoc's worker breaks under `vite dev`); the image carries `@superdoc/sdk`'s native binary.
- [ ] **Step 3: Tester briefing** — per the template: what changed per group; how to run (the production-shaped command in `test-plan.md`); suites red-today/green-after; hypotheses ("a reader's keystrokes never reach the log", "a rotated link stops working but members stay", "events appear within about 3 s of typing"); known gaps (no timeline, no time travel, a role change needs a reconnect, imported revisions need the native SDK).
- [ ] **Step 4: Commit** — `chore(docker): ship history migrations in the image` and `docs: add the documents-and-history briefing`

---

### Z. Prove and ship

- [ ] **Z1:** Developer A hands over `tester-briefing.md`; the orchestrator dispatches the `tester` with `test-plan.md` only.
- [ ] **Z2:** Tester executes `test-plan.md`, ticks with evidence, files defects to the owning group.
- [ ] **Z3:** `reviewer` on `git diff main...HEAD`; findings fixed; refutations recorded in `test-plan.md`.
- [ ] **Z4:** `/check-ui http://localhost:3100/documents documents-and-history --video` by the `recorder`.
- [ ] **Z5:** Learnings sweep (worker loader under Vitest, SuperDoc room prefix, joiners need a valid DOCX); ADR 0010 addendum for the HMAC-derived share token; `/open-pr documents-and-history`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|---|---|---|---|
| 3.1 | drizzle-kit drops or reorders the `updates_by_document` index | generated SQL lacks ``(`document_name`,`sequence`)`` | Fix the column order in `schema/history.ts` and regenerate; never hand-edit SQL |
| 5.3 | The walk-up does not find `libs/history/drizzle` from `apps/server/dist` | `MigrationsFolderNotFoundError` naming `dist/main.js` on `node apps/server/dist/main.js` | Start from the repo root (e2e) or `/app` (Docker, Task 13 copy); the error names the start URL |
| 6.3 | SuperDoc 2.23.0's room name is not `sd2/v2.1/<id>` for a uuid document id | every E2E socket refused; `room-name.test.ts` still green | Update `SUPERDOC_ROOM_PREFIX` and the pinned test together |
| 6.3 | A member's provider connects before the room finished loading from the log | restart test sees an empty text | `onLoadDocument` is awaited by Hocuspocus before sync; check the hook is `async` and applies with `LOADING_ORIGIN` |
| 7.3 | The worker cannot load TypeScript under Vitest | `ERR_UNKNOWN_FILE_EXTENSION ".ts"` from the worker | `execArgv: ['--import', 'tsx']` in source mode; `tsx` is already a server devDependency |
| 7.3 | `@superdoc/sdk` gets bundled by tsup | build error on a native `.node` file, or `Cannot find module` for the binary at runtime | Keep it in `external`; it resolves from `node_modules` |
| 7.3 | The worker's read-only handle opens before the main thread created the WAL files | `SQLITE_CANTOPEN` in the worker | Spawn the scheduler after migrations, as ordered in `server.ts` |
| 7.3 | The SDK's native process outlives the worker | after `pnpm test:unit`, `pgrep -f superdoc` lists processes | `ProjectionScheduler.stop()` posts `Stop`, which disposes the client before `process.exit(0)`; if a crash skipped it, the restart path leaves an orphan: record it and kill it in the test teardown |
| 7.3 | The SDK import hangs and blocks the worker's queue | events of other documents stop appearing | `withTimeout({ milliseconds: IMPORT_TIMEOUT_MS })` frees the queue and reports `ImportTimeoutError` like any import failure |
| 8.3 | `bodyLimit` counts the multipart envelope and refuses a 10 MB file | `a file of exactly 10 MB is not refused for its size` gets 413 | Raise `MULTIPART_ENVELOPE_BYTES`; the post-parse size check keeps the exact limit |
| 8.3 | Hono's sub-app does not forward thrown `DocumentNotFoundError` to the root handler | non-member test gets 500 | Keep the mapping on the root `app.onError`, as written |
| 11.3 | Vite 8 rejects `optimizeDeps.esbuildOptions` | build warning or error naming the option | Use the replacement the message names (`optimizeDeps.rolldownOptions`); only `build.target` matters for the production build |
| 8.3 | A reader opens a document no editor has opened yet | the reader's page would sit in `create` and fail; instead `GET /:id` answers 409 `NOT_READY` | The page shows `DOCUMENT_NOT_READY_MESSAGE`; the reader reloads after the owner opens it; `a reader waits until the room exists` pins it |
| 12.1 | Two `create` openers race on a brand-new document | one page never becomes ready (`'create' never joins an existing room`) | The specs open the owner first and wait for the editor before the member joins; the race is a documented limitation |
| 12.1 | Typing under concurrency lands characters out of order | marker check on the editor text fails while lengths match | Judge completion by length and attribution by `insertedBy`, as written; never by marker position |

**Steps with no backout:** none; every step is additive on a feature branch, and deleting documents only touches test databases.
