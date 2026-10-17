# Agentic history over MCP

**Status:** Approved
**Tier:** 🔴
**Owner approval:** approved 2026-10-17
**ADRs:** [0020](../../adr/0020-agent-edits-carry-a-human-or-agent-actor.md) agent actor identity · [0021](../../adr/0021-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md) MCP OAuth and room tokens · [0002](../../adr/0002-authorship-observed-vs-declared.md) identity tiers · [0010](../../adr/0010-documents-ownership-and-share-links.md) roles and share links · [0011](../../adr/0011-process-wide-llm-cost-caps.md) LLM caps · [0016](../../adr/0016-timeline-bin-budget.md) bin budget · [0019](../../adr/0019-deploy-on-railway.md) Railway
**Not changing:** the browser collaboration path and its `Origin` guard, the identity tiers of 0002, snapshots and time travel, the LLM caps, the share link model (two links per document, rotate to revoke), `poc/`. No in-app agent panel.

## Problem

A person who works on a document in SuperDoc History cannot ask their own AI client to read the history or edit the document for them. When they do it by hand outside the app, nothing in the history tells a human edit from an AI one. SuperDoc is moving towards agentic editing, and the [SDK room-join spike](../../../spikes/sdk-room-join/RESULTS.md) proved that a server-side `@superdoc/sdk` host can join the live Hocuspocus room and edit in tracked mode.

## Goals

1. Any MCP client (Claude Code, Cursor, ChatGPT and others) connects to the deployed app as a real person, through OAuth, and acts with that person's permissions.
2. The person sees every connected client and can revoke each one; the next call from a revoked client fails.
3. Four tool families: read the history, edit the live document in tracked mode, export DOCX, and share with the same rules as the UI.
4. Every AI edit is visibly the person's AI: "Name · AI" on tracked-change cards, a hatched layer in the streamgraph, an AI badge on authors, and timeline marks for share and export actions.

### Acceptance walk

1. The reviewer opens the deployed app, goes to Connected apps, and runs one command in Claude Code: `claude mcp add --transport http history <url>`. OAuth opens the app, they approve, and the page lists "Claude Code · connected" with a Revoke button.
2. In Claude Code they ask "what changed in this document this week and by whom?" and get an answer built from the real history.
3. They ask "rewrite the second paragraph more formally". In the browser a tracked change signed "Name · AI" appears, the streamgraph gains a hatched layer in that topic's colour, and the author list shows the AI badge.
4. They ask for the read link. The link works and the timeline shows a mark "Name · AI revealed the read link".
5. They click Revoke. The next tool call in Claude Code fails with 401.

## Non-goals

- An agent panel inside the app (later, on the same tool registry).
- Accepting or rejecting tracked changes through MCP: the human decides in the browser.
- Agents with no person behind them, and agents shared across people.
- More than one server replica.

## Design

### Data flow

```
MCP client ──OAuth 2.1──▶ /api/auth (mcp and jwt plugins)         ──▶ consent page (SPA)
MCP client ──Bearer JWT──▶ POST /api/mcp ─▶ consent guard ─▶ tool registry
                                                  │
              ┌───────────────────────────────────┼─────────────────────────────┐
         history read                         document edit                export / share
   timeline, topics, summaries        AgentSessions (one SDK host for all)       DocumentFileStorage,
   services in process                    │ room token (HMAC, minutes)      ShareLinksRepository
                                          ▼                                  │
                         /collaboration/agent (no Origin check, room token only)
                                          ▼                                  ▼
                         Hocuspocus onAuthenticate → context { userId, documentId, actor: Agent }
                                          ▼                                  ▼
                         UpdateLog.append({ …, actor })              agent_actions row
                                          ▼
                         projection → read model events carry actor → timeline (hatched layer, AI badge, marks)
```

### Interfaces

**Types (`libs/types`)**

- `enum ClientActor { Human = 'human', Agent = 'agent' }`
- `enum AgentScope { HistoryRead = 'history:read', DocumentEdit = 'document:edit', DocumentExport = 'document:export', DocumentShare = 'document:share' }`
- `enum AgentActionKind { ShareLinkRevealed = 'share-link-revealed', ShareLinkRotated = 'share-link-rotated', DocumentExported = 'document-exported' }`
- `enum AgentTool` with one member per tool below.
- `EventAuthor` gains `actor: ClientActor`. An agent's author key is `<userId>#agent`.
- `TimelineCell` gains `agentInserted` and `agentDeleted`; `inserted` and `deleted` stay totals.
- `AppRoute.OAuthConsent = '/oauth/consent'`, `AppRoute.ConnectedApps = '/settings/connected-apps'`, `ApiPath.Mcp = '/api/mcp'`, `ApiPath.AgentCollaboration = '/collaboration/agent'`.

**History (`libs/history`)**

- `updates.connection_actor` and `client_identities.actor`, both `NOT NULL`, backfilled `human`.
- `UpdateLog.append({ documentName, connectionUserId, connectionActor, update })`.
- A declaration overrides an `Observed` row only when the actors match; the user may differ, as in the relay correction of 0002 ([0020](../../adr/0020-agent-edits-carry-a-human-or-agent-actor.md)).
- Read model events carry `actor`; the timeline splits cell volume by actor.
- `agent_actions(document_name, user_id, kind, created_at)`, read into timeline marks next to version marks.

**Server (`apps/server/src`)**

- `auth/auth.ts`: `jwt` and `mcp` plugins (`mcp` is the OAuth provider); scopes from `AgentScope`; consent page `AppRoute.OAuthConsent`; login page `AppRoute.SignIn`.
- `collaboration/collaboration-server.ts`: `CollaborationContext` gains `actor`. `onAuthenticate` dispatches on the upgrade path: cookie for the browser path, room token for the agent path.
- `collaboration/attach-collaboration.ts`: the agent path skips the `Origin` check; the browser path keeps it.
- `agent/` (new):
  - `mcp-route.ts`: `POST /api/mcp`, stateless Streamable HTTP, one `McpServer` per request; consent guard first.
  - `agent-tools.ts`: a record keyed by `AgentTool` → `{ scope, minimumRole, inputSchema, handle }`.
  - `room-tokens.ts`: sign and verify `{ userId, documentId, actor, expiresAt }` with the auth secret.
  - `agent-sessions.ts`: one SDK client for the process; one open session per `userId:documentId`, opened with `userName: "Name · AI"` and the person's email, kept in an `LruMap` with a small cap; `withTimeout` on open; idle close. A session with an edit in flight is never evicted.
  - `agent-actions.ts`: writes `agent_actions`.

**Tools**

| Tool | Scope | Minimum role | Does |
|------|-------|--------------|------|
| `list_documents` | HistoryRead | Reader | documents the person is a member of, with role |
| `get_timeline` | HistoryRead | Reader | bins, bands, contributors, authors; bin budget of 0016 |
| `get_bin_edits` | HistoryRead | Reader | edit runs of one bin with authors |
| `list_topics` | HistoryRead | Reader | topics and their status |
| `summarize_selection` | HistoryRead | Editor | selection summary through `InsightsJobRunner`; busy returns the retry time |
| `inspect_document` | DocumentEdit | Editor | `superdoc_inspect` on the live room |
| `edit_document` | DocumentEdit | Editor | `superdoc_perform_action`, change mode forced to tracked |
| `export_docx` | DocumentExport | Reader | the live document as an embedded DOCX resource; records `DocumentExported` |
| `list_members` | DocumentShare | Reader | members and roles |
| `get_share_links` | DocumentShare | Owner | both links; records `ShareLinkRevealed` |
| `rotate_share_link` | DocumentShare | Owner | rotates one link; records `ShareLinkRotated` |

**Web (`apps/web/src/features`)**

- `oauth-consent/`: the consent page on the shared auth card; client name, scopes in plain words, Approve and Deny; `oauth-consent-copy.ts`.
- `connected-apps/`: list from `get-consents` with client name, connected date and scopes; Revoke calls `delete-consent` and invalidates the list; MCP URL and snippets for Claude Code, Cursor and ChatGPT with copy buttons; `connected-apps-copy.ts`. Reached from the user menu.
- `timeline/`: hatched agent layer per band, legend row, AI badge on `AuthorAvatar`, "Name · AI" in author names, agent action marks with tooltips.

### Failure handling

| Case | Answer |
|------|--------|
| No token, bad signature, wrong audience, expired | 401 with RFC 9728 `WWW-Authenticate` |
| Consent revoked | 401 with `WWW-Authenticate`, so the client re-runs OAuth |
| Token lacks the tool's scope | 403 |
| Not a member of the document | tool error "document not found", without telling whether it exists |
| Role below the tool's minimum | tool error naming the person's role |
| Room does not open within the timeout | the session closes; tool error; the next call opens again |
| Session cap reached | the least recently used idle session closes |
| Summary runner busy | tool error with the retry time, as the HTTP API does |
| Room token on the browser path, or cookie on the agent path | socket refused |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Who operates the agent first? | reviewer via MCP · in-app panel · both | a person via MCP from any client; the panel later | 2026-10-17 |
| How does an AI edit appear in identity? | child of the person · flag only · independent author | child of the person (`actor`) | 2026-10-17 |
| How does a client authorize? | personal token · OAuth · token then OAuth | OAuth, with revocable connected apps | 2026-10-17 |
| Which tool families ship first? | read · edit · export · share | all four | 2026-10-17 |
| How far does sharing go? | parity with the UI · read link only · list only | parity, every AI share action is a timeline mark | 2026-10-17 |
| What is the acceptance walk? | — | the five steps above | 2026-10-17 |
| Which architecture? | monolith module · separate service · edits without the SDK | monolith module in `apps/server` | 2026-10-17 |
| Does the SDK `open` accept a user per document, avoiding one host per person? | — | yes: `open({ userName, userEmail })` signs tracked changes per session; two sessions on one host kept their own names (probe on the spike stack) | 2026-10-17 |
| Is `createAgentToolkit` in `@superdoc/sdk` 2.20.0, or must it move to 2.21.0? | — | the toolkit is in 2.20.0, but per-open `collaborationAuth` is only in the 2.21.0 contract; move the app to 2.21.0, the version the spike proved | 2026-10-17 |

## Test strategy summary

- **Unit, `libs/history`:** actor stored on append; migration backfill; an agent clientId never promoted by a human declaration; cell volume split by actor; agent actions read into marks.
- **Unit, server:** consent guard per request; room token expiry and document binding; each upgrade path refuses the other's credential; the tool registry's scope and role rules as one `test.each` table; agent actions written by export and share tools.
- **Integration, server:** a real MCP client over Streamable HTTP against the test server, through dynamic registration, consent and token; read, tracked edit, export, rotate a link, revoke then 401.
- **E2E, Playwright:** approve consent in the browser, call tools from an MCP client in the spec, see the "Name · AI" card and the hatched layer, revoke in Connected apps.
- **Walk, Playwright MCP, recorded for the PR:** the acceptance walk with real Claude Code connected to the local app.
- **Merge sensitivity:** high (auth, sharing, update log, migrations). The PR carries the blast radius and a human checklist: run both migrations on a copy of the production data, connect Claude Code to Railway, revoke.
