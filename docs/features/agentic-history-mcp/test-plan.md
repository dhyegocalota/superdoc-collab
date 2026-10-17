# Test plan: Agentic history over MCP

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `libs/history/src/update-log.test.ts::append stores the connection actor and observes identities with it` — input: append with `connectionActor: Agent`; expected: the logged update and the observed identity both carry `agent`
- [ ] `apps/server/src/agent/agent-authorization.test.ts::a token whose consent was deleted is refused` — input: a valid access token after `delete-consent`; expected: `authorizeAgentRequest` returns null and the route answers 401 with `WWW-Authenticate`
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts::each path accepts only its credential` — input: cookie and room token on each path; expected: only cookie on the browser path and room token on the agent path connect
- [ ] Confirmed each fails for the right reason: the red run prints the missing behaviour (a stub's `is not implemented`, or the wrong actor), not a broken test; the printed text is recorded in `tester-briefing.md`

## Unit

### History (L1)

- [ ] `update-log.test.ts` — migration on a database with pre-existing rows; expected: every old `updates` and `client_identities` row reads `human`
- [ ] `relay-attribution.test.ts::a human declaration never claims an agent clientId` — input: agent clientId observed on an agent socket, a human's awareness declares the same clientId; expected: identity stays the agent's, source `observed`
- [ ] `read-model.test.ts::a projected event keeps the actor` — input: agent update projected; expected: stored event has `connection_actor = agent`, resolved author `{ id: userId, name: 'Ana · AI', actor: agent }`
- [ ] `timeline/runs.test.ts::an agent author key is userId#agent` — expected: `authorKey` returns `<userId>#agent` for an agent author and `<userId>` for the same person as human
- [ ] `timeline/bins.test.ts::a cell splits agent volume from the total` — input: 10 human and 4 agent inserted characters in one bin; expected: `inserted 14, agentInserted 4`
- [ ] `timeline/bands.test.ts` — contributors list the person and their AI as two rows with the same `id`
- [ ] `agent-actions.test.ts::recorded actions come back in time order` — expected: list ordered by `createdAt`, scoped to the document
- [ ] Edge: a document with no agent activity — expected: `agentInserted = 0`, `agentActions = []`, the timeline payload otherwise unchanged

### Auth and collaboration (L2)

- [ ] `auth/oauth.test.ts::discovery documents name the MCP resource` — expected: issuer equals `APP_ORIGIN`, protected resource `${APP_ORIGIN}/api/mcp`, scopes list the four `AgentScope` values
- [ ] `agent-authorization.test.ts::a token for another audience is refused` — expected: null
- [ ] `agent-authorization.test.ts` — expired token; expected: null; token with a valid consent; expected: `{ userId, clientId, scopes }`
- [ ] `room-tokens.test.ts` table — valid → `{ userId }`; expired → null; other document → null; tampered payload → null; other secret → null
- [ ] `attach-collaboration.test.ts::an agent path upgrade without an origin reaches authentication` — expected: the socket is upgraded and refused only by authentication when the token is missing
- [ ] `attach-collaboration.test.ts::the browser path still refuses a missing origin` — expected: destroyed
- [ ] `collaboration-server.test.ts::an agent update is logged with the Agent actor` — expected: the update row has `connection_actor = agent`
- [ ] Edge: a room token for a document where the person was removed — expected: refused at authentication
- [ ] Edge: a Reader's room token — expected: connection is read-only and no update is logged

### Agent and MCP (L3)

- [ ] `agent-tools.test.ts` `test.each` over every tool — missing scope → forbidden; role below minimum → error naming the role; not a member → "document not found"
- [ ] `agent-sessions.test.ts::a session opened for Ana signs tracked changes as Ana · AI`
- [ ] `agent-sessions.test.ts::a second person on the same host keeps their own name`
- [ ] `agent-sessions.test.ts::the least recently used idle session closes at the cap`
- [ ] `agent-sessions.test.ts::a session that does not open in time is closed and the call fails`
- [ ] `edit_document` with an `accept` or `reject` decision — expected: tool error, no update logged
- [ ] `edit_document` with `changeMode: 'direct'` — expected: applied as tracked
- [ ] `export_docx` — expected: an embedded resource with the DOCX mime type and a `DocumentExported` action
- [ ] `get_share_links` as Editor — expected: role error; as Owner — both links and a `ShareLinkRevealed` action
- [ ] `summarize_selection` while the runner is busy — expected: tool error carrying `retryAfterSeconds`
- [ ] `mcp-route.test.ts::no token answers 401 with WWW-Authenticate`
- [ ] `mcp-over-oauth.test.ts` — the full flow with a real MCP client: register, consent, token, list tools, read timeline, tracked edit seen by a Yjs client as "Name · AI", export, rotate, delete consent, next call 401

### Web (L4)

- [ ] `oauth-consent-page.test.tsx` — client name and scopes in plain words; Approve posts consent with `accept: true`; Deny with `accept: false`
- [ ] `connected-apps-page.test.tsx` — list with name, date and scopes; Revoke calls delete-consent and invalidates the list; empty state copy when none
- [ ] `connected-apps-page.test.tsx` — copy buttons copy the MCP URL and each snippet
- [ ] `streamgraph.test.tsx` — a band with agent volume renders a hatched layer (`data-actor="agent"`); none when agent volume is zero
- [ ] `contributor-avatars` — an agent author shows the AI badge (`aria-label` names the AI)
- [ ] `timeline-tooltip` — lists "Name · AI" for agent author keys
- [ ] agent action marks render one marker per action with a tooltip naming the action

## E2E (Playwright specs)

- [ ] `e2e/agent.spec.ts::an AI client connects, edits in tracked mode and is revoked` — steps: sign in as ana, upload the seed, register an MCP client, approve consent in the page, call `get_timeline`, `edit_document` with a replace; expected: the tracked-change card shows "Ana Lima · AI" (demo user name), the timeline shows a hatched layer, Connected apps lists the client, Revoke, the next tool call fails with 401
- [ ] `e2e/agent.spec.ts::a shared link revealed by the AI leaves a mark` — steps: `get_share_links`; expected: a mark on the time axis with the tooltip naming the action

## Prove it for real — Playwright MCP

- [ ] Happy path, entry to exit: Claude Code `claude mcp add --transport http history http://localhost:<port>/api/mcp`, OAuth in the browser, ask for the week's changes, ask for a formal rewrite, ask for the read link, revoke; expected: each step of the spec's acceptance walk
- [ ] Empty: a person with no documents asks for documents; expected: an empty list, no error
- [ ] Single: one document, one AI edit; expected: one hatched layer, one AI contributor row
- [ ] Many: three AI edits and two human edits in one topic; expected: the hatched share reflects the agent volume
- [ ] Rejected input: Reader asks the AI to edit; expected: tool error naming the Reader role, document unchanged
- [ ] Browser Back mid-flow: Back on the consent page; expected: no consent stored, the client's next call is 401
- [ ] Reload mid-flow: reload Connected apps after Revoke; expected: the client is gone
- [ ] Two authors in two browser contexts at once: ana types while her AI edits, bruno watches; expected: both see converged text and the AI card signed "Ana Lima · AI"
- [ ] Latency / disconnect: the server restarts during an AI session; expected: the next tool call reopens the session
- [ ] Console and network clean: zero console errors, zero failed requests, other than the expected 401 after Revoke
- [ ] Desktop width: 1280; expected: Connected apps table and snippets fit
- [ ] Narrow width: 375; expected: snippets wrap, no horizontal scroll
- [ ] Screenshots at `.pr-media/agentic-history-mcp/`; video at `.pr-media/agentic-history-mcp/walk.webm`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: Revoke cuts the next call — attack: keep a token, delete consent through the API, call `tools/call`; result: <refuted | held>
- [ ] Claim 2: the agent path exposes no ambient credential — attack: open the agent path from a foreign origin with ana's cookie; result: <refuted | held>
- [ ] Claim 3: AI edits are never attributed to the human — attack: relay an agent update through a human socket before the agent's is logged; result: <refuted | held> (known limitation in ADR 0020)

## Coverage honesty

- ChatGPT as a client is not automated: it needs a public HTTPS URL; covered by the human checklist on Railway.
- Cursor is not automated: same protocol as Claude Code.
- Multi-replica behaviour is out of scope (one replica, ADR 0019).
