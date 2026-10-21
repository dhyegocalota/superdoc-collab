# Spike (task 0): vendor facts for slice 2

- Date: 2026-10-16
- Versions: `superdoc` 2.23.0, `@hocuspocus/server` and `@hocuspocus/provider` 2.15.3, `yjs` 13.6.33, `better-sqlite3` 13.0.3 (SQLite 3.53.4), Node 24.7.0, headless Chromium through Playwright.
- Method: a throwaway client copied from the proof of concept's client (adds `user.id`, `documentMode` and `window.superdoc`), built with `vite build` and served with `vite preview` on port 5198, plus a wrapper `Hocuspocus` server that logs `onAuthenticate`, `onChange` and `onAwarenessUpdate`. All of it lived in a spike folder inside the proof of concept and was deleted afterwards; no POC or product file changed.

## 1. Awareness `userId`

**Probe.** Boot a `create` client with `user: { id: 'id-user42', name: 'name-user42', email: 'user42@example.com' }` and token `user42`. Log what `onAwarenessUpdate` receives. A second run omits `id`. The same server logs `document.connections[*].clients` per socket.

**Evidence (verbatim, `id` set).**

```
auth token=user42 document=sd2/v2.1/awareness readOnly=false
awareness states=[{"clientId":234213493,"schemaVersion":"1.0","userId":"id-user42","connectionId":"conn-1a1456ceaec-a141db50","state":"active","lastObservedAt":1792166128377,"displayName":"name-user42","color":"#45B7D1","selection":null,"operationIntent":"idle","extensions":{"superdocV2CursorUi":{"colorCategory":"valid-hex"},"email":"user42@example.com"}}] clientsBySocket=[{"user":"user42","clients":[234213493]}]
```

**Evidence (verbatim, `id` omitted).**

```
awareness states=[{"clientId":2704709888,"schemaVersion":"1.0","userId":"user42@example.com","connectionId":"conn-1a1456d1edd-6b9233d1","state":"active","lastObservedAt":1792166141673,"displayName":"name-user42","color":"#AED6F1","selection":null,"operationIntent":"idle","extensions":{"superdocV2CursorUi":{"colorCategory":"valid-hex"},"email":"user42@example.com"}}] clientsBySocket=[{"user":"user42","clients":[2704709888]}]
```

Static search: the `superdoc` bundle only calls `awareness.setLocalStateField("user", user)` for external (legacy) providers. The v2 awareness runs inside the bundled collaboration worker (`@superdoc/docx-engine` `dist/collaboration-worker.js`) and the public API exposes no way to set an awareness field. The only public input is the `user` config.

**Conclusion.** The awareness state is a v2 presence record, not `{ user: ... }`. Its `userId` is `user.id` when given and falls back to `user.email` when absent. `displayName` is `user.name`, `extensions.email` is `user.email`. The state's `clientId` equals the id in `document.connections[*].clients` for the socket that carries it.

**Consequence for the plan.** The fact holds. The browser must pass `user: { id: <userId>, name, email }` and the server matches `states.get(clientId).userId === connection.context.userId` where the context `userId` is the user's primary key, not the email. The slice 1 POC matched on email only because it omitted `id`. No fallback from the spec table is needed. Keep a test that fails if SuperDoc stops mirroring `user.id` into `userId`.

## 2. `join` ignores bytes

**Probe.** Author `ana` opens `create` with a two-paragraph DOCX. Author `bruno` opens `join` with `page.route('**/seed.docx')` serving a different one-paragraph DOCX ("JOINER FILE should be ignored."). A third client `caio` joins with an empty 200 body. Compare `window.poc.getText()`.

**Evidence (verbatim).**

```
creator text: "Creator paragraph one.Creator paragraph two."
joiner (different bytes) text: "Creator paragraph one.Creator paragraph two."
creator text after join: "Creator paragraph one.Creator paragraph two."
joiner (empty body) outcome: error {"status":"Connection failed.","errors":["Error: SuperDoc could not load the document editor because the document source could not be prepared."],"states":[]}
creator text at end: "Creator paragraph one.Creator paragraph two."
server onChange count after joins: 24 (all user=ana, none from the joiners)
```

**Conclusion.** The joiner shows the room's content; its own bytes are ignored and add no content, no duplicate and no server change. The creator is untouched. An empty blob is not an option: the client refuses it before connecting (`document source could not be prepared`, no connection state emitted).

**Consequence for the plan.** A joiner does not need the real file, but it still needs a valid DOCX as its `data`. Ship one tiny blank DOCX as a static asset (or build it once in the client) and pass it for every `join`. Only `create` fetches the stored original, and `create` is used only when the room is empty. Do not send an empty blob.

## 3. Read-only connection

**Probe.** The server sets `connection.readOnly = true` in `onAuthenticate` for tokens starting with `reader`. `ana` creates, `reader1` joins. The reader clicks the second paragraph, presses End and types ` READERTYPED`. Then `ana` types ` ANATYPED`. Wait until both clients contain `ANATYPED`, then open a late joiner `dani`. Two scenarios: the reader in the default `documentMode` and the reader with `documentMode: 'viewing'` in the SuperDoc config.

**Evidence (verbatim, default mode).**

```
reader state before typing: {"documentMode":"editing","connectionStates":["synced"],"errors":[],"readOnlyAttr":null,"editableNodes":[]}
ana text: "Paragraph owned by ana. ANATYPEDParagraph owned by reader."
reader text after ana edit synced: "Paragraph owned by ana. ANATYPEDParagraph owned by reader. READERTYPED"
late joiner text: "Paragraph owned by ana. ANATYPEDParagraph owned by reader."
onChange by user: {"user=ana":37}
reader state at end: {"documentMode":"editing","connectionStates":["synced"],"errors":[],"readOnlyAttr":null,"editableNodes":[]}
```

**Evidence (verbatim, `documentMode: 'viewing'`).**

```
reader state before typing: {"documentMode":"viewing","connectionStates":["synced"],"errors":[],"readOnlyAttr":null,"editableNodes":[]}
reader local text right after typing: "Paragraph owned by ana.Paragraph owned by reader."
ana text: "Paragraph owned by ana. ANATYPEDParagraph owned by reader."
reader text after ana edit synced: "Paragraph owned by ana. ANATYPEDParagraph owned by reader."
late joiner text: "Paragraph owned by ana. ANATYPEDParagraph owned by reader."
onChange by user: {"user=ana":37}
```

SuperDoc surface found in `dist/superdoc/src/core/SuperDoc.d.ts` and `types/index.d.ts`: `type DocumentMode = 'editing' | 'viewing' | 'suggesting'`, config `documentMode`, method `setDocumentMode(mode)`, event `document-mode-change`. The `readOnly` config key is typed `never` (rejected). There is no server-driven read-only signal: the connection stayed `synced` with no error.

**Conclusion.**
- Default mode: the server refuses the reader's update (`onChange` never fires for `reader1`, the author and a late joiner never see the text), but the reader's editor accepts the keystrokes and keeps them locally. The reader sees a document that silently diverges from the room: `READERTYPED` stays in their view, absent for everyone else, with no error, no state change and no revert. A reader would believe they edited.
- `documentMode: 'viewing'`: typing is blocked locally, nothing is shown that was not synced, and the reader still receives the live edits of others. This is the correct reader experience.

**Consequence for the plan.** Server enforcement is required but not enough. Set `connection.readOnly` in `onAuthenticate` for readers and always pass `documentMode: 'viewing'` to the reader's SuperDoc, in the owner's session too when a role is `viewer`. The read-only badge is our UI; SuperDoc gives no signal for it. A role change while connected needs a reconnect (or `setDocumentMode('viewing')` plus a server close) because the server decision is taken at authentication.

## 4. better-sqlite3 and `Uint8Array`

**Probe.** `CREATE TABLE t (id INTEGER PRIMARY KEY, blob BLOB NOT NULL)`, insert a `Uint8Array([0,1,2,253,254,255,0,7])` with `.run(bytes)` and no `Buffer.from`, read it back, round-trip through `new Uint8Array(row.blob)`. A second insert binds a `subarray` view.

**Evidence (verbatim).**

```
version 3.53.4
bound Uint8Array without Buffer.from: ok
returned type: Buffer isBuffer true isUint8Array true
new Uint8Array(row.blob) constructor: Uint8Array
byte identical: true [0,1,2,253,254,255,0,7]
subarray view stored: [1,2,3]
```

**Conclusion.** A `Uint8Array` binds directly, including a `subarray` view (only the viewed bytes are stored). The column comes back as a `Buffer`, which is a `Uint8Array`. `new Uint8Array(row.blob)` copies it into a plain `Uint8Array`, byte-identical.

**Consequence for the plan.** No `Buffer.from` on append. Convert reads with `new Uint8Array(row.blob)` so `Y.applyUpdate` and tests with `toEqual` get a plain `Uint8Array`.

## Decisions the plan can rely on

1. Browsers pass `user: { id: <user primary key>, name, email }`; the server declares identity where the awareness state's `userId` equals the socket context `userId`. SuperDoc falls back to the email when `id` is missing, so `id` is always passed.
2. `join` ignores the supplied bytes and shows the room's content, but it still requires a valid DOCX `data`. Use one tiny blank DOCX for joiners; never an empty blob.
3. Readers are enforced twice: `connection.readOnly = true` in `onAuthenticate` and `documentMode: 'viewing'` in the client. Server-side alone leaves a silently diverging local editor.
4. The read-only badge and the role-change handling are ours; SuperDoc emits no read-only signal and `readOnly` is not a config key.
5. Append to the update log with the `Uint8Array` as is; read with `new Uint8Array(row.blob)`.
