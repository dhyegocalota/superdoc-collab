# 0021. MCP clients authorize with OAuth; agents join rooms with a short-lived room token

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [SDK room-join spike](../../spikes/sdk-room-join/RESULTS.md), [0005](0005-authentication-with-better-auth.md), [0010](0010-documents-ownership-and-share-links.md), [0017](0017-share-links-reissued-when-the-secret-changes.md), [0019](0019-deploy-on-railway.md), Better Auth `@better-auth/oauth-provider` and `@better-auth/mcp` docs

## Context

The [agentic-history-mcp](../features/agentic-history-mcp/spec.md) feature exposes the app as a remote MCP server that any client connects to as a real person: Claude Code, Cursor, ChatGPT. Today the app authenticates by Better Auth session cookie only, on HTTP and on the collaboration socket. ChatGPT and claude.ai accept only OAuth for remote MCP servers; the owner wants every client, and wants each connected client to be revocable by the person.

Two further facts shape the decision. `delete-consent` in `@better-auth/oauth-provider` removes the consent row but leaves issued tokens valid. The collaboration upgrade handler destroys any socket whose `Origin` is not the app's, and the SDK host runs in Node without that header.

## Decision

- The app is both the OAuth 2.1 authorization server and the protected resource, through `@better-auth/oauth-provider`, `@better-auth/mcp` and the `jwt` plugin. Discovery (RFC 8414 and RFC 9728) and dynamic client registration are on. The resource is `${APP_ORIGIN}/api/mcp`.
- Scopes come from `AgentScope { HistoryRead, DocumentEdit, DocumentExport, DocumentShare }`, one per tool family. A tool checks the token scope first and the person's document role second, with the existing role rules.
- The MCP route verifies the JWT against the local JWKS, requires the resource as audience, and requires the `(userId, clientId)` consent to still exist on every request. A missing consent answers 401 with the RFC 9728 `WWW-Authenticate` header. This check is what makes Revoke take effect on the next call.
- OAuth tokens never reach the collaboration socket. To edit, the server signs a room token with the auth secret: `{ userId, documentId, actor: Agent, expiresAt }`, valid for minutes, and hands it to the SDK in `collaborationAuth`.
- Agents connect on a second upgrade path, `ApiPath.AgentCollaboration`, that skips the `Origin` check and accepts only a room token. The browser path keeps the `Origin` check and refuses a room token. Neither path accepts the other's credential, so no ambient credential is exposed without the origin guard.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| OAuth with the app as provider, consent checked per request (chosen) | works in every MCP client; one Connect click; revocable per client; reuses Better Auth | three new plugins and their tables; a consent page; a lookup per MCP request | — |
| Personal access token pasted into the client config | smallest; no consent page | ChatGPT and claude.ai cannot use it; a bearer secret the person must store | the owner wants every client |
| Personal token first, OAuth later | demo sooner | two auth paths to keep; the ChatGPT demo waits | the owner chose OAuth directly |
| Rely on `delete-consent` alone for revocation | no extra lookup | issued tokens stay valid until they expire | Revoke must cut the next call |
| Pass the OAuth access token to the socket | one credential | the socket learns about OAuth; long-lived bearer on a second surface | a room token is narrower: one user, one document, minutes |
| Relax the `Origin` check on the existing path when a token is present | one path | the upgrade happens before the token is read, so the guard would have to drop for everyone | a separate path keeps the browser guard intact |

## Consequences

- New Better Auth tables (`oauthClient`, `oauthConsent`, `oauthAccessToken`, `oauthRefreshToken`, `jwks`) in the auth database.
- Rotating `AUTH_SECRET` invalidates room tokens and JWT signing keys together, as it already does for share links ([0017](0017-share-links-reissued-when-the-secret-changes.md)); clients re-run OAuth.
- The issuer is the Railway URL ([0019](0019-deploy-on-railway.md)); local development uses `http://localhost`, which the MCP clients accept for loopback.
- One replica keeps the in-memory SDK hosts and the consent check consistent; a second replica would need shared state.

## Evidence

- Spike S2: `onAuthenticate({ token })` receives the per-open `collaborationAuth` token from the SDK host.
- Better Auth docs: `/oauth2/get-consents`, `/oauth2/delete-consent` and its note that it does not revoke tokens; `createMcpProtectedRequestHandler` and the `mcp` plugin options.

## Revisit when

- Better Auth revokes tokens on consent deletion, which would make the per-request consent lookup redundant.
- The app runs more than one replica.
