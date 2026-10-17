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
2. Hypothesis: only OAuth access tokens verify. Break it by: present a session JWT from `/api/auth/token`, an ID token, a token whose `aud` is `APP_ORIGIN`, and a token signed by another instance; each must return null.
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

