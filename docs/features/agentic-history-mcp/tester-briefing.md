# Tester briefing: Agentic history over MCP

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## L1 history

Lane `developer-history`, branch `feat/agentic-history-mcp-history`, plan Steps 1 to 6.

### What changed

- `libs/history/src/update-log.ts` — `append` takes a required `connectionActor`; `observeClientIdentity` and `declareClientIdentity` take the actor; `clientIdentities` returns `{ userId, actor }` per clientId; a declaration overrides an `Observed` row only when the observed row has the same actor; `forget` also deletes the document's agent actions.
- `libs/history/drizzle/history/0001_*.sql`, `0002_*.sql` and `libs/history/drizzle/read-model/0002_*.sql` — generated: `updates.connection_actor`, `client_identities.actor` and `edit_events.connection_actor` as `NOT NULL DEFAULT 'human'` (the default is the backfill, so no hand-written `UPDATE`), and the `agent_actions` table.
- `libs/history/src/edit-events.ts`, `read-model.ts` — projection and read model carry the actor; `resolveAuthorIds` returns `{ userId, actor }[]` sorted by user then actor.
- `libs/history/src/agent-actions.ts` — `AgentActionsLog.record` and `list`.
- `libs/history/src/timeline/runs.ts`, `bins.ts` — `authorKey` returns `<userId>#agent` for agents, `agentAuthorKey(userId)`, `isAgentAuthorKey`, `isAgentRun`; a cell splits `agentInserted` and `agentDeleted` from the totals. A run counts as agent volume only when every author key of the run is an agent key.
- `apps/server/src/history/resolved-events.ts` — `EventAuthor` has `actor`; agents are named `Name · AI`; imported authors are `Human`.
- `apps/server/src/history/agent-action-views.ts`, `timeline-service.ts` — `DocumentTimeline.agentActions` holds the actions from `services.agentActions` whose time is inside the first to last bin; the acting user's AI is added to `authors` so a mark can name it. The author filter now looks contacts up by user id, so filtering by a person's email matches their AI too.
- Out of lane, compile-only or wiring: `apps/server/src/collaboration/collaboration-server.ts` and `client-declarations.ts` pass `ClientActor.Human`; `apps/server/src/http/app.ts` and `server.ts` expose and construct `AgentActionsLog`; fixtures in `apps/server/src/insights/selection-summaries-service.test.ts` and `apps/server/src/documents/documents-routes.test.ts` gained `actor`.

### How to run

```bash
pnpm --filter @superdoc-history/history test:unit
pnpm --filter @superdoc-history/server test:unit
pnpm typecheck
```

### Red today, green after

Red text is what the red run printed.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/history/src/update-log.test.ts::append stores the connection actor and observes identities with it` | `SqliteError: no such column: actor` | the migration adds the columns and `append` writes them (cb6346d red, 26fcff9 green) |
| `libs/history/src/update-log.test.ts::rows logged before the actor migration read as human` | `SqliteError: no such column: connection_actor` | `DEFAULT 'human'` backfills rows written under the first migration |
| `libs/history/src/relay-attribution.test.ts::a human declaration never claims an agent clientId` | `AssertionError: expected 'declared' to be 'observed'` | the upsert only overrides when the actor matches (8fe33ae red, 253cd67 green) |
| `libs/history/src/relay-attribution.test.ts` (four updated tests, one new agent test) | `expected [ 'bruno@example.com' ] to deeply equal [ { …(2) } ]` | `resolveAuthorIds` returns bindings |
| `libs/history/src/read-model.test.ts::a projected event keeps the actor` | `AssertionError: expected undefined to be 'agent'` | the read model stores and reads `connection_actor` (c616004 red, 865c8f7 green) |
| `libs/history/src/timeline/runs.test.ts` `test.each` author key | `AssertionError: expected 'ana' to be 'ana#agent'` | `authorKey` appends `#agent` for agents (9b8fabc red, 467412b green) |
| `libs/history/src/timeline/bins.test.ts::a cell splits agent volume from the total` | `expected { inserted: 14, deleted: 3, agentInserted: 0 … } to equal agentInserted 4` (the first expectation also had the author keys in the wrong order; fixed in the green commit) | `mergeCell` adds agent volume |
| `libs/history/src/agent-actions.test.ts` (two tests) | `Error: AgentActionsLog.record is not implemented` and `…list is not implemented` | the log and its table (51e2eae red, 51eeecc green) |
| `apps/server/src/history/timeline-routes.test.ts::agent actions inside the span come back with the agent author, and the others are left out` | `AssertionError: expected [] to deeply equal [ { …(3) } ]` | `readAgentActions` filters by the bin span (b649407 red, 39f7adc green) |

Pins (green when they landed): `timeline/bands.test.ts::contributors list a person and their AI as two rows` (contributors already group by author key). Written after the code and mutation-checked: `apps/server/src/history/resolved-events.test.ts` (dropping `agentAuthorName` fails the agent row) and `update-log.test.ts::forget removes the agent actions of the document` (removing `agent_actions` from the forgotten tables fails it).

### Hypotheses to attack

1. Hypothesis: a database written before this change opens with every update and identity as `human`. Break it by: copy a production-shaped `history.sqlite` and `read-model.sqlite`, start the server, and select distinct `connection_actor` and `actor` values.
2. Hypothesis: a human awareness declaration can never turn an agent clientId into a human one. Break it by: observe a clientId as agent, declare it as the same user as human and as another user as human, then read `client_identities`.
3. Hypothesis: the same user's human and agent edits appear as two authors with the same `id` and different keys (`id` and `id#agent`). Break it by: one update from each actor in one room and read `/timeline`.
4. Hypothesis: a bin with 10 human and 4 agent inserted characters reports `inserted 14`, `agentInserted 4`. Break it by: a run written by both a human and an agent in the same event (co-authored); I count it as human volume.
5. Hypothesis: `agentActions` contains only actions between the first bin start and the last bin end, and is empty for a document with no agent activity, with every `agentInserted` zero. Break it by: an action exactly at the last bin end (excluded) and one at the first bin start (included).
6. Hypothesis: filtering the timeline by a person's email also keeps their AI rows. Break it by: `?author=<email>` on a room with agent edits.

### Known gaps

- `apps/web` fixtures that build `EventAuthor` or `TimelineCell` or `DocumentTimeline` no longer typecheck; L4 owns them (see the report to the lead for file and line).
- The read-model change is not rebuilt for old rows: events projected before the migration read `human`, which is true because no agent could connect before.
- `agent_actions` rows are only deleted by `UpdateLog.forget`; nothing prunes them otherwise.
- `AgentActionsLog` is wired in `server.ts` with two lines that L3 also edits; the merge should keep one.

### Review fixes

- Agent actions now widen the span that picks the bin width and the covering bins, so an action after the last edit, or in a document with no edits, gets a bin and a mark (hypothesis 5 above is superseded: nothing is dropped, bins grow instead). Red: `AssertionError: expected [] to deeply equal [ 1767225600000, 1767229200000 ]` (only actions) and `expected false to be true` (after the last edit). Tests: `timeline-routes.test.ts` "an action after the last edit…", "a document with only agent actions…".
- `AgentActionsLog.list({ documentName, from, until })` reads a range and `span(documentName)` gives the bounds. Red: `expected [ 5, 10, 20, 30 ] to deeply equal [ 10, 20 ]` and `AgentActionsLog.span is not implemented`.
- Marks follow the author filter (matching on merged authors, so a person's email keeps their AI's marks) and ignore the term filter. Red: `expected [ …(2) ] to deeply equal [ Array(1) ]`. Hypothesis: filtering by the editor hides the owner's AI marks.

## L2 auth and collaboration

### What changed

- `apps/server/src/auth/auth.ts`: `createAuth` adds the `jwt` plugin (issuer `APP_ORIGIN`, audience the MCP resource, session JWT header off) and `mcp` (the OAuth provider: dynamic registration, scopes are the four `AgentScope` values plus `offline_access`, login page `AppRoute.SignIn`, consent page `AppRoute.OAuthConsent`, native loopback clients inferred). `mcpResourceOf(appOrigin)` builds `${APP_ORIGIN}/api/mcp`. The `omitSessionToken` hook still only touches the two email paths.
- `apps/server/src/auth/oauth-discovery.ts`: `mountOAuthDiscovery({ app, auth })` forwards `GET /.well-known/*` to Better Auth. One line added to `apps/server/src/http/app.ts` calls it.
- `apps/server/src/database/schema/auth.ts` and `apps/server/drizzle/0004_lying_hawkeye.sql`: eight new tables (`jwks`, `oauth_client`, `oauth_resource`, `oauth_client_resource`, `oauth_refresh_token`, `oauth_access_token`, `oauth_consent`, `oauth_client_assertion`). Additive only.
- `apps/server/src/agent/agent-authorization.ts`: `authorizeAgentRequest` and `unauthorizedAgentResponse`.
- `apps/server/src/agent/room-tokens.ts`: `signRoomToken`, `verifyRoomToken`, `ROOM_TOKEN_TTL_MS`.
- `apps/server/src/collaboration/`: second upgrade path without the origin check (`attach-collaboration.ts`), `authenticate-agent.ts`, `upgrade-path.ts`, `CollaborationContext.actor`, `onChange` passes `connectionActor`, `client-declarations.ts` skips agent connections.
- `apps/server/src/testing/oauth-client.ts` (new), `collaboration-client.ts` gains `connectAgentToDocument`, `test-server.ts` exports `TEST_AUTH_SECRET`.
- `.claude/rules/collaboration.md`: one line on the path-based credential.

### How to run

```bash
pnpm --filter @superdoc-history/server exec vitest run src/auth src/agent src/collaboration
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `auth/oauth.test.ts::discovery documents name the MCP resource` | `expected 404 to be 200` | discovery is mounted and the plugins name the resource |
| `auth/oauth.test.ts::the protected resource metadata answers on the path-suffixed URL MCP clients try first` | pin, green on landing | wildcard mount |
| `agent/agent-authorization.test.ts` (9 tests) | `authorizeAgentRequest is not implemented`, `unauthorizedAgentResponse is not implemented` | JWT, audience and live consent are checked |
| `agent/room-tokens.test.ts` (9 rows) | `signRoomToken is not implemented` | HMAC, document, expiry and constant-time compare |
| `collaboration/attach-collaboration.test.ts::an agent path upgrade without an origin reaches authentication` | `expected '' to contain '101'` (socket destroyed) | agent path skips the origin check |
| `collaboration/attach-collaboration.test.ts::the browser path still refuses a missing origin` | pin (renamed from `an upgrade without an origin is destroyed`) | unchanged |
| `collaboration/attach-collaboration.test.ts::an upgrade on a path that only extends the agent path is destroyed` | pin | exact path match |
| `collaboration/collaboration-server.test.ts` rows `a room token on the agent path`, `a cookie on the agent path`, test `an agent update is logged with the Agent actor`, test `a reader room token connects read-only` | `The collaboration server refused the connection.`; `promise resolved ... instead of rejecting` for the cookie on the agent path; the actor poll never saw `[agent]` | `onAuthenticate` reads the upgrade path |
| `collaboration/collaboration-server.test.ts` other rows, the Human actor test and the removed member test | pins, green on landing | unchanged |
| `collaboration/client-declarations.test.ts::an agent connection declares nothing` | `expected [ '1:ana' ] to deeply equal []` | agent connections are filtered out |

The red test for attach-collaboration first waited for the socket to close, which only happens at the ten second authentication timeout; the green commit changed it to read the first chunk. The red text above is from the first version.

### Hypotheses to attack

1. Hypothesis: deleting a consent makes the next `authorizeAgentRequest` return null even though the JWT is unexpired. Break it by: delete the consent through `POST /api/auth/oauth2/delete-consent` and call again; also restore a consent for the same client by approving again and check the old token works again (it should, the consent is the gate).
2. Hypothesis (first version refuted by the security review, fixed): only OAuth access tokens verify. The first version accepted a DPoP-bound token as a plain bearer and ignored the `typ` header. Now the Better Auth resource verifier runs first, then the `at+jwt` type and the consent lookup. Break it by: a session JWT from `/api/auth/token`, an ID token, a token whose `aud` is `APP_ORIGIN`, a DPoP-bound token with and without a proof, a token signed by another instance; each must return null.
3. Hypothesis: neither collaboration path accepts the other's credential. Break it by: browser path with a room token and no cookie; agent path with a cookie and the placeholder token; agent path with a cookie and a valid room token for another person (the person in the token wins, the cookie is ignored).
4. Hypothesis: a room token cannot be replayed across documents or after five minutes. Break it by: reuse after `ROOM_TOKEN_TTL_MS`, change one byte of the payload or of the signature, swap the document in the room name.
5. Hypothesis: registration of Cursor-style and Claude Code style clients works. Break it by: register with `redirect_uris` of `http://localhost:PORT/callback`, `http://127.0.0.1:PORT/callback` and a custom scheme with no `application_type`; register a web client with an `http` loopback URI and `application_type: web` (refused by design).
6. Hypothesis: sign-in and sign-up responses still omit `token` and OAuth token responses still carry `access_token`. Break it by: call both and compare.
7. Hypothesis: the rate limiter on `/oauth2/register` (five per minute per address) does not break the E2E walk. Break it by: register six clients from one address.

### Known gaps

- The token endpoint answers `access_token` only; no refresh token is issued unless a client asks for `offline_access`. Refresh was not exercised.
- `authorizeAgentRequest` takes scopes from the token, not from the stored consent; a consent narrowed with `update-consent` does not narrow an issued token until it expires (one hour).
- Rotating `AUTH_SECRET` invalidates JWT signing keys and room tokens together, as the ADR says; not exercised.
- `/.well-known/openid-configuration` answers 404 because `openid` is not a requested scope.
- Discovery is mounted without the client address header, so Better Auth rate-limits by whatever address it resolves for those requests.

### Review fixes (second pass)

| Test | Red before the fix because | Green after because |
|------|-----------------------------|----------------------|
| `agent/agent-authorization.test.ts` DPoP-bound token as a plain bearer | `expected { userId, clientId, scopes } to be null` | `verifyAccessTokenRequest` enforces the binding |
| `agent/agent-authorization.test.ts` signed token of another type | `expected { ... } to be null` | `typ` must be `at+jwt` |
| `agent/agent-authorization.test.ts` lowercase bearer, valid DPoP proof | `expected null to match object` | scheme parsing by the verifier |
| `agent/agent-authorization.test.ts` client that omits `resource` | `expected null to match object` (opaque token) | a hook adds the MCP resource on authorize and token |
| `auth/oauth.test.ts` consent post from a foreign origin | `expected 400 to be 403` (Vitest skips the origin check) | `advanced.disableOriginCheck: false` |
| `agent/room-tokens.test.ts` signature from the raw secret | `expected { userId: 'user-ana' } to deeply equal null` | key derived with a fixed label |

- Pins: session token refused, no-proof DPoP refused, app origin consent row, empty agent token refused in `attach-collaboration.test.ts`.
- Mutation check: deleting `connection.readOnly = true` in `collaboration-server.ts` turns `a reader room token connects read-only and no update is logged` red (`expected [ ... ] to not include '<reader id>'`); restored.
- `attachCollaboration` no longer takes `agentPath`; `isAgentUpgrade` in `collaboration/upgrade-path.ts` serves the upgrade handler and `onAuthenticate`.
- With the origin check on, requests that post credentials must carry `Origin`. Test helpers and three test files now send it. Browsers always do. Cookie-less OAuth calls (register, token) need none.
- Gap: the replay store for DPoP proofs is the process-local default, fine for one replica.

## L3 agent and MCP

Lane `developer-agent`, branch `feat/agentic-history-mcp-agent`, plan Steps 13 to 19. L1 and L2 were merged before the wiring.

### What changed

- `apps/server/src/agent/agent-tools.ts`: `AGENT_TOOLS` is a record keyed by `AgentTool`; `callAgentTool` checks the scope, then the role through `requireDocumentRole`, then runs the handler. A missing scope is a tool error "not allowed", a non-member gets "Document not found", a role below the minimum gets an error naming the person's role. Handlers live in `read-tools.ts`, `document-tools.ts` and `share-tools.ts`; `agent-tool-definition.ts` holds `defineTool` (parses the input once) and `personOf`; `tool-results.ts` holds the result and error helpers.
- `apps/server/src/agent/agent-sessions.ts`: one SDK client for the process, sessions keyed `userId:documentId` in an `LruMap` (cap 8), idle close after 5 minutes, open guarded by a 30 second `withTimeout`, calls on one key serialized, a session leaves the map while a call runs so it is never evicted, a failed call closes its session.
- `apps/server/src/agent/mcp-route.ts`: `POST /api/mcp`, stateless Streamable HTTP in JSON response mode with a fresh `McpServer` and transport per request, tools listed by the token scopes; `GET` and `DELETE` answer 405.
- `apps/server/src/http/app.ts` mounts the route outside the CSRF and cookie middleware; `apps/server/src/server.ts` builds the toolkit and `AgentSessions` and closes the sessions first in `stop`.
- `apps/server/src/insights/document-topics.ts`: `documentTopics` extracted from the insights routes.
- `apps/server/src/agent/agent-tool-fixtures.ts`: test fixtures for tool contexts and a seeded document.

### How to run

```bash
pnpm --filter @superdoc-history/server exec vitest run src/agent
pnpm typecheck
```

### Red today, green after

Red text is what the red run printed.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `agent/agent-tools.test.ts` and `agent/agent-document-tools.test.ts` (53 tests) | `Error: callAgentTool is not implemented` | the registry and the eleven handlers (b015c45 red, 1a444b7 green) |
| `agent/mcp-route.test.ts::no token answers 401 with WWW-Authenticate` and the other eight | `AssertionError: expected 404 to be 401`, `expected 404 to be 405`, `Streamable HTTP error: Error POSTing to endpoint: 404 Not Found` (empty route) | the route (f886132 red, 0db74a8 green; the no-scope case changed to 403 in the green commit) |
| `agent/agent-sessions.test.ts` (10 tests) | `Error: AgentSessions.run is not implemented` | the sessions (c6b462d red, d41fbf7 green) |
| `agent/mcp-over-oauth.test.ts` (7 tests) | `Error: Streamable HTTP error: Error POSTing to endpoint: {"error":"Not found"}` in `beforeAll`, all 7 skipped | the route is mounted (5c2308e red, e4c0e4c green); the edit, export and mark tests also needed the L2 agent path |

Pins (green when they landed, written after the code because they need the L2 room-token path): `agent/agent-sessions-room.test.ts::a session opened for Ana signs tracked changes as Ana · AI` and `::a second person on the same host keeps their own name` (6401bd5).

### Hypotheses to attack

1. Hypothesis: a client reaches a tool only if its token scope allows it, both in `tools/list` and in `tools/call`. Break it by: a token with only `history:read` calling `rotate_share_link` by name, and a token whose scope string lists only `offline_access` (expected 403 on the POST).
2. Hypothesis: every document tool answers "Document not found" for a non-member exactly as for an unknown id. Break it by: compare the two error bodies for each tool.
3. Hypothesis: `edit_document` can only produce tracked changes and cannot accept, reject or delete. Break it by: `action` values `accept_tracked_changes`, `reject_tracked_changes`, `trackChanges.decide`, `changeMode: 'direct'` and extra unknown fields; read the document in the browser.
4. Hypothesis: two people on one server keep their own "Name · AI" even when their calls overlap. Break it by: two MCP clients editing the same document in parallel, then read the review cards.
5. Hypothesis: the session cap never closes a room that is in use. Break it by: nine documents edited in parallel from one person, watching for a failed call.
6. Hypothesis: `export_docx` removes its temporary file on success and on failure. Break it by: list the OS temp directory for `superdoc-history-export-*` after an export of a closed room and after killing a call.
7. Hypothesis: after Revoke the next call is 401 and the app has no open SDK session left that keeps editing. Break it by: revoke while an edit call is in flight and check the session ends at idle close.
8. Hypothesis: a document nobody has opened yet is created by the first agent call from its stored file. Break it by: upload a DOCX, call `inspect_document` without opening the browser, then open it in the browser and compare text and history.

### Known gaps

- `summarize_selection` needs the Editor role, like `POST /summaries/selection`; the spec table says Reader. The cost-bearing action keeps the HTTP rule. Say so if the owner wants Reader.
- Room tokens live five minutes and sessions can live longer; the SDK reconnect inside a long session would present an expired token. A failed call closes the session, so the next call opens with a fresh token. Not exercised.
- A document that was never opened has its room created by the agent (`roomMode: create` from the stored file), so the bootstrap update is logged with the Agent actor of that person.
- The embedded SDK host process is spawned at the first open; cold start time and a writable state directory in the Railway container were not measured.
- `get_share_links` puts the link secrets in the model transcript by design (spec); the reveal is recorded on the timeline.
- `HttpStatus` has no 405; `mcp-route.ts` declares `METHOD_NOT_ALLOWED_STATUS` locally because `libs/types/src/http.ts` is outside this lane.
- There is no per-call timeout for a tool call on an open session other than the SDK's own.

### For the E2E lane

- Token in a browser flow: register a client (`POST /api/auth/oauth2/register`), open the authorize URL signed in, approve on `AppRoute.OAuthConsent`, exchange the code at `/api/auth/oauth2/token` with `resource=${APP_ORIGIN}/api/mcp`; `apps/server/src/testing/oauth-client.ts` does it without a browser (`connectAgentClient`).
- Call with `Authorization: Bearer <access token>` and `Accept: application/json, text/event-stream` on `POST /api/mcp`; the official `Client` with `StreamableHTTPClientTransport` does this.
- Argument shapes: `list_documents {}`; `get_timeline {documentId, term?, author?}`; `get_bin_edits {documentId, binStart, binMs?, term?, author?}`; `list_topics {documentId}`; `summarize_selection {documentId, term?, author?, topic?, at?, binMs?}`; `inspect_document {documentId, findText?}`; `edit_document {documentId, action: replace_text | insert_paragraphs | insert_heading, edits: [{find, replace}] | texts: string[] | text + level}`; `export_docx {documentId}` returns an embedded resource with the DOCX mime type; `list_members {documentId}`; `get_share_links {documentId}`; `rotate_share_link {documentId, role: edit | read}`.
- Errors come back as `isError` results whose text is JSON `{error, retryAfterSeconds?}`.

### Review fixes

Reviewer round on this lane; red commit dfdeef8 and 7bceef5, green fd38378 and f8a0d67.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `agent-sessions-room.test.ts::a Reader promoted to Editor while the session is cached has the next edit logged` | `expected 24 to be greater than 24` | the cached session is replaced when the role changed |
| `agent-sessions-room.test.ts::a session near the end of its room token is replaced, so an edit after a reconnect is logged` | `expected 31 to be greater than 31` | a session older than the token lifetime minus the open timeout is replaced |
| `agent-sessions.test.ts` role, name, age and cap tests | `expected vi.fn() to be called 2 times, but got 1 times` and `to be called 1 times, but got 2 times` | `OpenedSession` records role, name and `openedAt`; in-flight rooms count in the cap |
| `agent-document-tools.test.ts` limits, stored-file export and hidden unknown errors | `expected undefined to be true`, `Error: No document session is expected here`, `Error: the room is gone` | limits, `roomMode` check and `TOOL_FAILED_MESSAGE` |
| `agent-tools.test.ts::list_documents ignores a documentId it does not take` | `expected [ true, … ] to deeply equal [ undefined, … ]` | tools declare whether they target a document |
| `mcp-route.test.ts::a body over the limit answers 413 before any tool runs` | `expected 400 to be 413` | `bodyLimit` on the route |

Hypotheses to add: a Reader promoted while its session is cached edits successfully on the next call; a call during an in-flight edit on a ninth document waits and then succeeds; `get_timeline` with no `documentId` is a tool error; a body of 256 KiB plus one byte answers 413.

## L4 web

### What changed

- `apps/web/src/features/auth/auth-client.ts`: the `oauthProviderClient()` plugin, which adds the signed `oauth_query` to every non-GET auth request made while the consent query string is in the address bar.
- `apps/web/src/features/oauth-consent/`: the consent page at `AppRoute.OAuthConsent` behind `RequireSession` (the sign-in `next` keeps pathname and query string). `oauth-consent-copy.ts` holds the scope sentences per `AgentScope`.
- `apps/web/src/features/connected-apps/`: the page at `AppRoute.ConnectedApps` behind `RequireSession`, linked from the documents header next to the user name.
- `apps/web/src/features/timeline/`: `agent-hatch.tsx`, `agent-legend.tsx` and `agent-action-marks.tsx`; the layout gains `agentPath` per band and `timeX`; `AuthorAvatar` takes `actor`.
- `apps/web/src/testing/timeline-fixtures.ts`: `timelineWith` takes `agentVolumes` and `agentActions`; the fixture authors include an agent `ana#agent` named "Ana · AI".

### Better Auth client calls

| Where | Call |
|---|---|
| client name on the consent page | `authClient.oauth2.publicClient({ query: { client_id } })` reading `client_name` |
| Approve and Deny | `authClient.oauth2.consent({ accept })`; the response is `{ redirect: true, url }` and Better Auth's redirect plugin sets `window.location.href`, so the page never navigates itself |
| Connected apps list | `authClient.oauth2.getConsents()` joined with `publicClient` per `clientId` |
| Revoke | `authClient.oauth2.deleteConsent({ id })`, then `invalidateQueries` on `['connected-apps']` |

The consent page reads `client_id` and `scope` (space separated) from the query string and renders every requested scope; a scope outside `AgentScope` is printed as is. A request without `client_id` or `scope` shows the incomplete message and renders no buttons.

### Selectors for the E2E lane

| Surface | Selector |
|---|---|
| consent buttons | `getByRole('button', { name: 'Approve' })`, `getByRole('button', { name: 'Deny' })` |
| consent scope list | `getByRole('region', { name: 'It will be able to' })` |
| header link | `getByRole('link', { name: 'Connected apps' })` |
| revoke | `getByRole('button', { name: 'Revoke <client name>' })` |
| empty state | text "No AI clients connected yet" |
| copy buttons | `getByRole('button', { name: 'Copy MCP URL' })`, `'Copy Claude Code'`, `'Copy Cursor'`, `'Copy ChatGPT'`; the clipboard needs permissions in Chromium |
| hatched agent layer | `svg path[data-actor="agent"]`, `aria-hidden`, `fill="url(#agent-hatch-<band id>)"`; patterns in `svg defs pattern` |
| legend row | text "Hatched: edited by AI" |
| AI badge | element with `aria-label="Edited by AI"` inside the avatar `li` whose `title` is "Name · AI" |
| action marks | `getByRole('button', { name: '<Name · AI> revealed a share link' })` (also "rotated a share link", "exported the document"); hovering or focusing shows `role="tooltip"` with the same sentence |

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `features/oauth-consent/oauth-consent-page.test.tsx` (6555eff) | `OAuthConsentPage is not implemented` (5 tests) | page, api and hooks (e4ec03b) |
| `features/connected-apps/connected-apps-page.test.tsx` (e2e2fe8) | `ConnectedAppsPage is not implemented` | page, api, hooks, copy buttons (10be077) |
| `features/documents/documents-page.test.tsx::the header links to the connected apps page` | `Unable to find role="link" and name "Connected apps"` | header link (10be077) |
| `features/timeline/streamgraph-layout.test.ts::a band without agent volume has no agent path…` (f680ee6) | `.toMatch() expects to receive a string, but got object` (the path was null) | `agentPath` computed (c37b262) |
| `features/timeline/streamgraph.test.tsx` agent layer and legend row (f680ee6) | `expected  to have a length of 1 but got +0`; `Unable to find an element with the text: Hatched: edited by AI` | layer, pattern, legend (c37b262) |
| `features/timeline/contributor-avatars.test.tsx::an agent author shows the AI badge…` (f680ee6) | `Unable to find a label with the text of: Edited by AI` | badge (c37b262) |
| `features/timeline/streamgraph-layout.test.ts::timeX maps a moment…` (e050943) | `timeX is not implemented` | `timeX` (3d78702) |
| `features/timeline/streamgraph.test.tsx` action marks (e050943) | `Unable to find an accessible element with the role "button" and name "Ana · AI revealed a share link"` | marks (3d78702) |

Pins, green when they landed: the streamgraph tooltip lists the agent author once with the suffix; a timeline without agent actions renders no marks; the fixture commit 31910aa only adds the required `actor`, `agentInserted`, `agentDeleted` and `agentActions` fields.

### Hypotheses to attack

1. Hypothesis: opening the authorization URL signed out lands on sign-in, and after sign-in returns to the consent page with the full signed query string. Break it by: sign in with a different account than the one used before, reload the consent page, press Back.
2. Hypothesis: Approve and Deny each redirect the browser to the client's `redirect_uri` exactly once. Break it by: double-clicking Approve; the buttons disable on the first click.
3. Hypothesis: Revoke removes the row after the refetch and the client's next call is 401. Break it by: revoking with a second tab open on the same page, then revoking the same row again.
4. Hypothesis: the hatched layer height equals the agent share of the band at every bin and the band stays selectable under it. Break it by: a bin where only the agent edits, a bin where nobody edits, clicking on the hatched area.
5. Hypothesis: marks sit at their action time on the axis and their tooltips stay inside the chart at both edges. Break it by: an action at the first and last bin, two actions in the same second, 375 px width.
6. Hypothesis: snippets wrap at 375 px without horizontal scroll. Break it by: the Cursor JSON block at 375 px.

### Known gaps

- Dark mode: the hatch uses `fill-background` for the gap between stripes; not checked visually in dark mode.
- Several action marks at nearly the same time overlap; no clustering.
- The consent page does not offer choosing a subset of scopes; Approve accepts all requested scopes.
- `AuthorAvatar` in the selection summary card derives the actor from the " · AI" suffix of the name, because summaries carry names only.
- Nothing here was run in a browser; the redirect after Approve is the redirect plugin's behaviour and is only unit-tested through the mocked client.

### Review fixes

- Sign-in redirect goes to `next` (was always Documents); the consent card shows "Access will be sent to <host>"; a client without a name shows its redirect host on consent and "Unnamed AI client" with Revoke on Connected apps; `invalid_signature` shows the expired message on consent and sign-in; the sign-up and sign-in links keep a signed query; sign-up refuses names ending in "· AI"; AI badge and action marks are `role="img"` (marks are focusable images, no longer buttons); ChatGPT copy button copies only the URL; `OFFLINE_ACCESS_SCOPE` lives in `libs/types`.
- E2E selectors changed: action marks are `getByRole('img', { name })`; the AI badge is `getByRole('img', { name: 'Edited by AI' })`.
- Verified: auth and agent E2E specs pass on a scratch config (12 tests) including the signed-out authorize walk and the Connected apps deep link.

## L5 E2E

### What changed

- `e2e/agent.ts`: registers an MCP client by dynamic registration, drives the consent page, exchanges the code with PKCE, calls tools with `@modelcontextprotocol/sdk` over Streamable HTTP and a bearer token, opens Connected apps and revokes. Tool argument shapes live only here (`readTimelineThroughAgent`, `replaceTextThroughAgent`, `revealShareLinksThroughAgent`).
- `e2e/agent.spec.ts`: the two E2E boxes of the test plan.
- `e2e/tsconfig.json`: a `paths` entry maps `@modelcontextprotocol/sdk/*` to the copy installed in `apps/server`, so no root dependency was added. Playwright honours the same mapping at run time.

### How the OAuth code is captured

The client registers a loopback redirect URI on the app's own origin, with no `application_type`, like Claude Code does. The spec signs in as Ana, opens the authorization URL (PKCE S256, `resource` set to the MCP URL) in a second page of the same context, and clicks Approve. `page.route` fulfils the redirect request with an empty 200 and `waitForRequest` reads `code` and `state` from its URL. The token call is made without cookies, as a real client would.

### How to run

```
pnpm exec playwright test e2e/agent.spec.ts
```

If another worktree already holds ports 3100 and 3199, use a scratch copy of `playwright.config.ts` with other ports and delete it afterwards.

### Tests

Both tests were written after the product code landed, so neither was red first. Both are pins of the lanes' work.

| Test | Pin of |
|------|--------|
| an AI client connects, edits in tracked mode and is revoked | OAuth registration and consent, MCP route, tracked edit through the SDK room join, "Ana · AI" card, hatched layer, Connected apps, revoke then 401 |
| a shared link revealed by the AI leaves a mark | `get_share_links`, `agent_actions`, the timeline mark and its tooltip |

### Hypotheses to attack

1. Hypothesis: the tracked-change card is found by the SuperDoc class `.comments-dialog.floating-comment`. Break it by: upgrade SuperDoc and rerun; the selector is the only coupling.
2. Hypothesis: the revoked call fails at `initialize` with HTTP 401. Break it by: revoke between `initialize` and a tool call with a long-lived client.
3. Hypothesis: three parallel runs do not collide. Break it by: `--repeat-each 5` with four workers; registration is limited to five per minute per address and each test uses its own address.

### Added after the lead's review

- The first test also asserts the AI badge (`Edited by AI`) inside the author list item titled "Ana · AI".
- `a document exported by the AI is a DOCX and leaves a mark`: `export_docx` returns an embedded resource with the DOCX mime type and bytes that start with the ZIP signature, and the "exported the document" mark appears.
- The share-link mark is now awaited without a reload and appeared on its own. Repeat runs: 12 of 12 green at 4 workers, 8 of 9 and 17 of 18 at 3 and 6 workers; the one failure each time was the first test timing out on the Hiring band appearing after 60 seconds under load (topic naming shares two model slots across workers).

### Known gaps

- None known for the lane; all three tests are pins, not red-first.

### L3 tester findings

- `edit_document` returns an error result (`isError`) with the receipt reasons and `status` when the receipt is `failed`, `partial` or `aborted` (red f52dcf5).
- Known SDK behaviour: `insert_paragraphs` has no style argument in the toolkit (`action-descriptors.json` lists `text`, `texts`, `headingLevel`, `placement`, `changeMode`, `evidence`), so paragraphs inserted straight after `insert_heading` can take its style. The `edit_document` description says so. A workaround through `placement` was not tried.
