# Agentic history over MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** spec.md
**Tier:** 🔴
**Goal:** a remote MCP server inside `apps/server` that any AI client reaches through OAuth as a real person, reads the history, edits the live room in tracked mode, exports and shares, with every AI edit marked "Name · AI".
**Architecture:** Better Auth becomes the OAuth authorization server and the MCP route the protected resource ([0025](../../adr/0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md)). One `@superdoc/sdk` host opens one session per person and document over a dedicated agent socket path with a room token. The update log, read model and timeline carry a `ClientActor` next to the user ([0024](../../adr/0024-agent-edits-carry-a-human-or-agent-actor.md)).
**Tech Stack:** Hono 4.13, Hocuspocus 2.15.3, better-auth 1.7.10 with `@better-auth/oauth-provider` and `@better-auth/mcp` 1.7.10, `@modelcontextprotocol/sdk` 1.32.1, `@superdoc/sdk` 2.21.0, drizzle-kit 0.31.11, Vitest, Playwright, React 19 with TanStack Query.
**Seam:** `UpdateLog.append` and `CollaborationContext` (identity), `createAuth` (OAuth), the HTTP upgrade handler (agent path), `createApp` (MCP route), the timeline pipeline (actor split and marks), the web router (two pages).
**Assumptions (decided, owner can override):**
- The owner pre-approved this plan and the test plan on 2026-10-17 ("do jeito que vier, eu aprovo").
- Session cap `MAX_AGENT_SESSIONS = 8`, idle close after `AGENT_SESSION_IDLE_MS = 5 * MINUTE_MS`, open timeout `AGENT_SESSION_OPEN_TIMEOUT_MS = 30 * SECOND_MS`, room token lifetime `ROOM_TOKEN_TTL_MS = 5 * MINUTE_MS`.
- No new environment variable: the MCP resource is `${APP_ORIGIN}${ApiPath.Mcp}` and the agent socket URL is built from the server's own port, so the compose and runbook tests stay untouched.

## Global Constraints

- Repository conventions in `AGENTS.md` → Code conventions: no comments except `// NB ADR NNNN:` pointers, flat ifs, no `else`, no `??` fallback, enums, named parameters, array methods, one handler per kind from a record, shared helpers from `apps/server/src/limits/`, copy in `*-copy.ts`.
- Red-first: the failing test is its own commit before the implementation; a stub throwing `<name> is not implemented` is allowed in the red commit.
- `pnpm exec prettier --write <staged files>` before every commit; Conventional Commits; never `git add -A`.
- Migrations are generated with drizzle-kit: `pnpm --filter @superdoc-collab/history generate` for the history and read model sets; `pnpm --filter @superdoc-collab/server exec drizzle-kit generate --config drizzle.config.ts` for the auth database. A backfill `UPDATE` may be appended to the generated SQL by hand.
- Tracked mode only: the agent never accepts or rejects tracked changes.

## Review Focus

1. A revoked client keeps a valid JWT: the next MCP call must still answer 401 (consent check per request).
2. A cookie presented on the agent socket path, or a room token on the browser path, must be refused; a room token for document A must not open document B.
3. Two people's AI sessions on one SDK host must never sign with each other's name (`userName` per open).
4. A Reader's token with `document:edit` scope must still be refused by `edit_document` (role check after scope check).
5. Existing documents logged before the migration must keep their authors and appear as human (backfill), and an agent clientId must never be promoted by a human awareness declaration.

---

## File map

| Group | Paths owned | Developer |
|-------|-------------|-----------|
| C0 (lead) | `apps/server/package.json`, `apps/web/package.json`, `pnpm-lock.yaml`, `libs/types/src/agent.ts`, `libs/types/src/routes.ts`, `libs/types/src/index.ts`, this plan and the test plan | lead |
| L1 history | `libs/history/**`, `libs/types/src/history.ts`, `libs/types/src/timeline.ts`, `apps/server/src/history/**`, `apps/server/src/testing/timeline-client.ts` | `developer-history` |
| L2 auth and collaboration | `apps/server/src/auth/**`, `apps/server/src/database/schema/auth.ts`, `apps/server/drizzle/**`, `apps/server/src/collaboration/**`, `apps/server/src/agent/room-tokens*.ts`, `apps/server/src/agent/agent-authorization*.ts`, `apps/server/src/testing/collaboration-client.ts`, `apps/server/src/testing/test-server.ts`, `apps/server/src/testing/oauth-client.ts` | `developer-auth` |
| L3 agent and MCP | `apps/server/src/agent/**` except L2's files, `apps/server/src/http/app.ts`, `apps/server/src/server.ts`, `apps/server/src/insights/insights-routes.ts` (extract `documentTopics` only), `apps/server/README.md` | `developer-agent` |
| L4 web | `apps/web/**` | `developer-web` |
| L5 E2E | `e2e/**`, `playwright.config.ts` | `developer-e2e` |

## Sequencing

- C0 lands first on `feat/agentic-history-mcp`: dependencies (`@superdoc/sdk` 2.21.0, `@better-auth/oauth-provider`, `@better-auth/mcp`, `@modelcontextprotocol/sdk`) and the new enums and route constants every lane imports.
- L1, L2, L3 and L4 start in parallel from C0, each in its own worktree and lane branch.
- L2 step "agent socket context carries the actor" needs L1 step 1 (`append` takes `connectionActor`); the lead merges L1 into L2 when L1 step 1 is committed.
- L3 codes against the interfaces named below; it merges L1 and L2 before its wiring step (L3 step 6).
- L4's timeline steps need L1's type changes; the lead merges L1 into L4 when L1 step 4 is committed. L4 starts with the consent and connected-apps pages.
- L5 starts when L2 and L3 are merged into the feature branch.

## Interfaces between lanes

- C0 → all: `libs/types/src/agent.ts` exports `enum ClientActor { Human = 'human', Agent = 'agent' }`, `enum AgentScope { HistoryRead = 'history:read', DocumentEdit = 'document:edit', DocumentExport = 'document:export', DocumentShare = 'document:share' }`, `enum AgentActionKind { ShareLinkRevealed = 'share-link-revealed', ShareLinkRotated = 'share-link-rotated', DocumentExported = 'document-exported' }`, `enum AgentTool { ListDocuments = 'list_documents', GetTimeline = 'get_timeline', GetBinEdits = 'get_bin_edits', ListTopics = 'list_topics', SummarizeSelection = 'summarize_selection', InspectDocument = 'inspect_document', EditDocument = 'edit_document', ExportDocx = 'export_docx', ListMembers = 'list_members', GetShareLinks = 'get_share_links', RotateShareLink = 'rotate_share_link' }`, `AGENT_NAME_SUFFIX = ' · AI'`, `agentAuthorName(name: string): string`. `routes.ts` gains `AppRoute.OAuthConsent = '/oauth/consent'`, `AppRoute.ConnectedApps = '/settings/connected-apps'`, `ApiPath.Mcp = '/api/mcp'`, `ApiPath.AgentCollaboration = '/collaboration/agent'`.
- L1 → L2, L3: `UpdateLog.append({ documentName, connectionUserId, connectionActor, update })`; `AgentActionsLog` in `libs/history/src/agent-actions.ts` with `record({ documentName, userId, kind, createdAt }): void` and ~~`list(documentName): AgentActionMark[]`~~ `list({ documentName, from, until }): AgentActionMark[]` (a bound range through the index) and `span(documentName): { first, last } | null`, stored in the history database; `AgentActionMark = { userId: string; kind: AgentActionKind; createdAt: number }` in ~~`libs/types/src/timeline.ts`~~ `libs/types/src/history.ts` (L1 owns that file, not `timeline.ts`).
- L1 → L4: `EventAuthor = { id: string | null; name: string; actor: ClientActor }`; `TimelineCell = { inserted; deleted; agentInserted; agentDeleted; authorKeys }`; `DocumentTimeline.agentActions: AgentActionView[]` with `AgentActionView = { authorKey: string; kind: AgentActionKind; createdAt: number }`; agent author key `${userId}#agent`.
- L2 → L3: `apps/server/src/agent/room-tokens.ts` exports `signRoomToken({ secret, userId, documentId, now }): string` and `verifyRoomToken({ secret, token, documentId, now }): { userId: string } | null`; `apps/server/src/agent/agent-authorization.ts` exports `authorizeAgentRequest({ auth, request }): Promise<AgentPrincipal | null>` with `AgentPrincipal = { userId: string; clientId: string; scopes: AgentScope[] }` and `unauthorizedAgentResponse({ appOrigin }): Response` (401 with the RFC 9728 `WWW-Authenticate`). `CollaborationContext = { userId; documentId; actor: ClientActor }`.
- L3 → L5: `POST /api/mcp`; tools named by `AgentTool`.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### C0

- [ ] **Step 0.1:** Add the dependencies at exact versions and run `pnpm install`; `pnpm typecheck` and `pnpm --filter @superdoc-collab/server test:unit` stay green on SDK 2.21.0 (the projection worker uses the SDK).
- [ ] **Step 0.2:** Add `libs/types/src/agent.ts` with the enums and `agentAuthorName`, export it, add the route constants; unit test `agentAuthorName('Ana')` is `'Ana · AI'`.

### L1 history

- [x] **Step 1:** (cb6346d red, 26fcff9 green) Red: `update-log.test.ts` "append stores the connection actor and observes identities with it"; then `connection_actor` on `updates` and `actor` on `client_identities` (schema, generated migration with ~~`UPDATE … SET … = 'human'` backfill~~ the columns are `NOT NULL DEFAULT 'human'`, which backfills; SQLite needs a default for ADD COLUMN NOT NULL, so no `UPDATE` exists), `append` takes `connectionActor`, every caller passes it (tests and `collaboration-server.ts` `onChange` passes `ClientActor.Human` until L2 reads it from the context; this one line is the only touch outside L1 and is announced to the lead).
- [x] **Step 2:** (8fe33ae red, 253cd67 green. Deviation: the override guard is the same actor only, not user and actor, because the existing test 'a later declaration by the owner corrects the provisional binding' needs a declaration to replace a relaying user) Red: `relay-attribution.test.ts` "a human declaration never claims an agent clientId"; then `declareClientIdentity` takes the actor and only overrides an `Observed` row with the same user and actor; `clientIdentities` returns `{ userId, actor }`.
- [x] **Step 3:** (c616004 red, 865c8f7 green) Red: `read-model.test.ts` "a projected event keeps the actor"; read-model column `connection_actor`, projection and `resolveAuthorIds` carry `{ userId, actor }`, `resolved-events.ts` builds `EventAuthor` with `actor` and `agentAuthorName` for agents; imported authors are `Human`.
- [x] **Step 4:** (9b8fabc red, 467412b green) Red: `timeline/bins.test.ts` "a cell splits agent volume from the total" and `runs.test.ts` "an agent author key is userId#agent"; then `authorKey`, `TimelineCell.agentInserted/agentDeleted`, contributors keep agent rows separate; types in `libs/types/src/timeline.ts` and `history.ts`.
- [x] **Step 5:** (51e2eae red, 51eeecc green; timeline b649407 red, 39f7adc green; wiring 83139f0) Red: `agent-actions.test.ts` "recorded actions come back in time order"; then `AgentActionsLog` and its table in the history set; `timeline-service.ts` returns `agentActions` within the timeline span.
- [x] **Step 6:** (README, rules/history.md and the L1 section of tester-briefing.md) Update `libs/history/README.md` and `libs/types/README.md` where layout changed; write the L1 part of `tester-briefing.md`.

### L2 auth and collaboration

- [x] **Step 7:** Red: `auth/oauth.test.ts` "discovery documents name the MCP resource" (GET `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` answer with the issuer `APP_ORIGIN` and resource `${APP_ORIGIN}/api/mcp`); then `jwt`, `oauthProvider` (dynamic registration, scopes from `AgentScope`, consent page `AppRoute.OAuthConsent`, login page `AppRoute.SignIn`) and `mcp` plugins in `createAuth`, generated auth migration, schema exported for the drizzle adapter, `.well-known` routes mounted. Evidence: red `3f34ab3`, green `589fa95`, native-client fix `63d5979`; `auth/oauth.test.ts`.
- [x] **Step 8:** Red: `testing/oauth-client.ts` drives registration, authorize with a signed-in cookie, consent and token exchange; `agent-authorization.test.ts` "a token whose consent was deleted is refused" and "a token for another audience is refused"; then `authorizeAgentRequest` and `unauthorizedAgentResponse` with `// NB ADR 0025` on the consent lookup. Evidence: red `3a86dce`, green `9c281b2`; `agent/agent-authorization.test.ts`, helper `testing/oauth-client.ts`.
- [x] **Step 9:** Red: `room-tokens.test.ts` table: valid, expired, other document, tampered, signed with another secret; then `signRoomToken` and `verifyRoomToken` (HMAC-SHA256 over a base64url JSON payload with the auth secret). Evidence: red `0d6fdbe`, green `8e23e7b`; `agent/room-tokens.test.ts`.
- [x] **Step 10:** Red: `attach-collaboration.test.ts` "an agent path upgrade without an origin reaches authentication" and "the browser path still refuses a missing origin"; then the second upgrade path `ApiPath.AgentCollaboration` without the origin check. Evidence: red `73a608d`, green `7ff7871`; `collaboration/attach-collaboration.test.ts`.
- [x] **Step 11:** (after L1 step 1 is merged in) Red: `collaboration-server.test.ts` table "each path accepts only its credential" (cookie on the browser path, room token on the agent path, each refused on the other) and "an agent update is logged with the Agent actor"; then `onAuthenticate` reads the path from `request.url`, `CollaborationContext.actor`, `onChange` passes `context.actor`, `client-declarations.ts` declares with the context actor and never for agent connections. Evidence: red `d7ce49c` and `4f36bba`, green `42053f2`; `collaboration/collaboration-server.test.ts`, `client-declarations.test.ts`.
- [x] **Step 12:** Update `apps/server/README.md` auth notes owned by L2 via the lead; write the L2 part of `tester-briefing.md`. Evidence: briefing written; the README facts are reported to the lead, who owns `apps/server/README.md`.

### L3 agent and MCP

- [x] **Step 13:** (b015c45 red with 15, 1a444b7 green. Steps 13 and 15 share one red/green pair because the registry is one record keyed by every tool; the handlers of both steps are in 1a444b7. `documentTopics` extracted in 6a8a8ef. Deviation: `summarize_selection` requires Editor like the HTTP POST, not Reader as the spec table says) Red: `agent-tools.test.ts` `test.each` over every `AgentTool`: missing scope → 403 error kind, role below minimum → role error, not a member → not found; then `agent-tools.ts` as a record keyed by `AgentTool` → `{ scope, minimumRole, inputSchema, handle }` and the read handlers (`list_documents`, `get_timeline`, `get_bin_edits`, `list_topics`, `summarize_selection` with busy mapped to a tool error carrying `retryAfterSeconds`), extracting `documentTopics` from `insights-routes.ts` into `insights/document-topics.ts`.
- [x] **Step 14:** (c6b462d red, d41fbf7 green for the cap, in-flight, timeout and reuse tests with a fake SDK client; 6401bd5 pins the real-session tests `a session opened for Ana signs tracked changes as Ana · AI` and `a second person on the same host keeps their own name` against the test server, written after the code because they need the room-token path of L2. Addition: `locateRoom` makes a never-opened document create its room from the stored file) Red: `agent-sessions.test.ts` against a test server: "a session opened for Ana signs tracked changes as Ana · AI", "a second person on the same host keeps their own name", "the least recently used idle session closes at the cap", "a session that does not open in time is closed and the call fails"; then `agent-sessions.ts` with one SDK client, `LruMap`, `withTimeout`, room tokens from L2.
- [x] **Step 15:** (b015c45 red, 1a444b7 green; see Step 13) Red: handlers for `inspect_document` and `edit_document` (change mode forced to tracked; an `accept` or `reject` action is refused); `export_docx` returns an embedded resource and records `DocumentExported`; `list_members`, `get_share_links` (records `ShareLinkRevealed`), `rotate_share_link` (records `ShareLinkRotated`).
- [x] **Step 16:** (f886132 red, 0db74a8 green. Deviation: a token whose scopes match no tool answers 403, because an `McpServer` with no tool does not declare the tools capability) Red: `mcp-route.test.ts` "no token answers 401 with WWW-Authenticate"; then `mcp-route.ts` (stateless Streamable HTTP, one `McpServer` per request, tools listed by the token scopes) mounted at `ApiPath.Mcp` outside the CSRF and cookie middleware.
- [x] **Step 17:** (71db017 services and sessions, e4c0e4c mounts the route; L1 and L2 merged first in 43da166) Wire `AgentSessions` and `AgentActionsLog` in `server.ts` (closed in `stop`), merge L1 and L2 first.
- [x] **Step 18:** (5c2308e red, e4c0e4c green for list, timeline and scopes, the rest green after the L2 merge 43da166: 7 tests) Red: `agent/mcp-over-oauth.test.ts` integration with a real `@modelcontextprotocol/sdk` client over Streamable HTTP and the L2 OAuth helper: list tools, read the timeline, tracked edit visible to a browser-like Yjs client with author "Name · AI", export, rotate a link and see the action mark, delete consent then the next call is 401.
- [x] **Step 19:** (this commit) `apps/server/README.md` layout gains `agent/`; write the L3 part of `tester-briefing.md`.

### L4 web

- [x] **Step 20:** Red: `oauth-consent-page.test.tsx` "shows the client name and the scopes in plain words; Approve posts the consent"; then `features/oauth-consent/` on the shared auth card, `oauth-consent-copy.ts`, route `AppRoute.OAuthConsent` behind `RequireSession` keeping the query string. (red 6555eff, green e4ec03b)
- [x] **Step 21:** Red: `connected-apps-page.test.tsx` "lists clients with connected date and scopes; Revoke calls delete-consent and invalidates the list"; "copy buttons copy the MCP URL and each snippet"; then `features/connected-apps/` (`connected-apps-api.ts`, `use-connected-apps.ts`, `use-revoke-connected-app.ts`, `connected-apps-copy.ts`), route `AppRoute.ConnectedApps`, link from the documents page header next to the user name. (red e2e2fe8 and the documents header test, green 10be077)
- [x] **Step 22:** (after L1 step 4) Red: `streamgraph.test.tsx` "a band with agent volume renders a hatched agent layer"; legend row; `contributor-avatars` "an agent author shows the AI badge"; `timeline-tooltip` lists "Name · AI". (merge of the history lane 467412b; red f680ee6, green c37b262; the tooltip row is a pin because author names already carry the suffix)
- [x] **Step 23:** (after L1 step 5) Red: agent action marks on the time axis with tooltips naming the action; then the marks. (red e050943, green 3d78702)
- [x] **Step 24:** Update `apps/web/README.md` layout; write the L4 part of `tester-briefing.md`.

### L5 E2E

- [x] **Step 25:** `e2e/agent.ts` helpers: register a client, approve consent in the page, exchange the code, call tools with `@modelcontextprotocol/sdk`. Evidence: commits 9866b84 and 48009c4; the OAuth walk ran green before the tools existed.
- [x] **Step 26:** `e2e/agent.spec.ts`: the five-step acceptance walk of the spec, asserting the tracked-change card name, the hatched layer, the share mark and the 401 after Revoke. Evidence: `agent.spec.ts` two tests, green three times in a row on a scratch stack (6 passed).
- [x] **Step 27:** Update `e2e/README.md` spec list. Evidence: README lists `agent.spec.ts` and `agent.ts`.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 0.1 | SDK 2.21.0 changes projection output | server unit tests on projection fail | pin 2.20.0 for the projection worker and open the agent sessions with 2.21.0 only after asking the owner |
| 1 | backfill misses rows | migration test finds a null actor | fix the generated SQL before merge; the migration has not shipped |
| 7 | better-auth plugins clash with the existing hooks (`omitSessionToken` strips tokens) | token endpoint answers without `access_token` | scope the hook to the email sign-in paths only |
| 10 | the agent path becomes a hole for cookies | step 11 table fails | refuse cookies on the agent path in `onAuthenticate` |
| 14 | the SDK host leaks processes in tests | vitest hangs after the file | close the client in `afterAll`; `stop()` closes sessions |
| 16 | Hono and the Node transport disagree on the request body | MCP client gets 400 on initialize | pass the raw Node request through `@hono/node-server` bindings |
| 22 | hatched layer breaks the streamgraph screenshot | visual diff in the walk | render the layer behind a feature check on `agentInserted > 0` |

**Steps with no backout:** none before merge; after deploy, the two migrations add columns and tables only, so rollback keeps data.

## Z. Prove and ship

- [ ] **Tester briefing:** every lane wrote its part of `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict with blast radius and merge sensitivity; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings and docs sweep stated, PR opened; `verify.yml` and the dispatched `e2e.yml` green.

### Note: actor-driven AI icon

Step 22's name-suffix badge was replaced by an actor-driven icon ([ADR 0028](../../adr/0028-the-actor-not-the-name-marks-an-ai-in-our-interface.md)): server names stay plain, summaries carry `{ name, actor }`, the reserved-name rule was removed. Commits on the web lane: a42a74e (server), da96a98 red and 2f2617a green (web).
