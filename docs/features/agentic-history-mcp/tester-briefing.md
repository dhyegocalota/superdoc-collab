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

