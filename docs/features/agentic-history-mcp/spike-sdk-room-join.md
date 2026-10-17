# Spike — SuperDoc SDK inside a live Hocuspocus room

> Throwaway spike, 2026-10-17. Its code was removed from the tree the same day; read it at commit `c1ada06` (`git show c1ada06:spikes/sdk-room-join/<file>`). Question: can a server-side agent built on
> `@superdoc/sdk` edit the **live collaborative document** (not a file on disk),
> in tracked mode, so that every editor sees the change and the history
> attributes it to the agent? Stack: `@superdoc/sdk` 2.21.0 (embedded CLI
> host) · `@hocuspocus/server` 2.15.3 · Yjs 13.6 · Vitest.

## Verdict

**Yes.** All four hypotheses passed, green twice in a row, typecheck clean.

| ID | Hypothesis | Result | Evidence |
|----|------------|--------|----------|
| S1 | `roomMode: 'create'` bootstraps a Hocuspocus room from a DOCX | ✅ PASS | Server `Y.Doc` main story reads the four seed paragraphs; the room name is `sd2/v2.1/<documentId>` as in the app |
| S2 | `roomMode: 'join'` with a per-open token applies a tracked `replace` that reaches the server | ✅ PASS | `onAuthenticate` receives the token; 7 of 7 updates carry the agent connection's user id; server text contains the replacement |
| S3 | A second joiner sees the tracked change with the agent as author | ✅ PASS | `trackChanges.list()` returns one `replacement`, author name equals the `user.name` given to `createSuperDocClient` |
| S4 | `createAgentToolkit({ provider: 'vercel', preset: 'core', enforceChangeMode: 'tracked' })` dispatches against the live room | ✅ PASS | Two tools (`superdoc_inspect`, `superdoc_perform_action`); `replace_text` receipt `status: ok`, `verificationPassed: true`, server text updated |

## Round 2 — human in the browser versus agent over MCP

> Question from the owner: prove it in a real browser, humans and agent editing
> the same room in real time, with real MCP tool calls. Playwright built and served the SuperDoc v2 client from `client/` at `c1ada06`.

The stock `@superdoc/mcp` 1.8.0 cannot join a room: its `superdoc_open` takes
only `path` (an absolute `.docx` on disk). So the spike ships its own MCP server
(`mcp-server.ts`, stdio, `@modelcontextprotocol/sdk` 1.32) that exposes the same
five lifecycle tools but opens the **live room** and dispatches `superdoc_inspect`
and `superdoc_perform_action` through `createAgentToolkit`. The test drives it
with a real MCP client over stdio: every call below is a JSON-RPC `tools/call`.

| ID | Scenario | Result | Evidence |
|----|----------|--------|----------|
| M1 | `tools/list` returns the five lifecycle tools | ✅ | `superdoc_open`, `superdoc_inspect`, `superdoc_perform_action`, `superdoc_save`, `superdoc_close` |
| M2 | `superdoc_open` joins the room a human created in the browser; `superdoc_inspect` reads the seed | ✅ | 4 paragraphs; inspected text equals the human's `doc.getText()` |
| M3 | The agent sees what the human types, live | ✅ | marker typed in Chromium appears in the next `superdoc_inspect` |
| M4 | The human sees a tracked `replace_text` by the agent, with the agent as author | ✅ | browser `trackChanges.list()` names `History Agent` |
| M5 | `insert_paragraphs` and `insert_heading` by the agent appear in the browser | ✅ | both receipts `status: ok` |
| M6 | Human types while the agent replaces text; browser, server `Y.Doc` and agent inspect converge byte-for-byte | ✅ | one `expect.poll` on all three views |
| M7 | The human accepts an agent tracked change in the browser; the agent's next inspect shows fewer open changes | ✅ | `trackChanges.decide({ decision: 'accept', target: { kind: 'id', id } })` |
| M8 | A second human joins late and sees the merged state | ✅ | two browsers identical and equal to the server |
| M9 | `superdoc_save` exports the live room to DOCX; `superdoc_close` leaves the edits in the room | ✅ | file written; server text unchanged; 199 updates by the human, 56 by the agent |

Green twice in a row; the whole suite runs in about 17 s after the Vite build.

## Round 3 — live walkthrough, watched in a real browser

> Owner: "I want to see it in the browser too." Done by hand on 2026-10-17 with
> the Playwright MCP driving a visible Chromium while the agent's tool calls went
> over MCP (Streamable HTTP, `HISTORY_MCP_PORT`) through `agent-call.ts`.
> Screenshots in `media/live-0*.png`. Stack: `pnpm exec tsx run-stack.ts 4712`,
> `pnpm exec vite preview`, `HISTORY_MCP_PORT=4790 … pnpm exec tsx mcp-server.ts`.

1. `ana` opened `?mode=create` in the browser, state `synced` (`live-01`).
2. Agent: `tools/list` (5 tools), `superdoc_open` → session; `superdoc_inspect` read the 4 seed paragraphs.
3. `ana` typed ` <ANA-LIVE>Humana digitando ao vivo.`; the next `superdoc_inspect` returned it at revision 2 (`live-02`).
4. Agent: `replace_text`, `insert_paragraphs`, `insert_heading`, all `changeMode: 'tracked'`, receipts `ok`. The browser rendered strike-through plus insertions and four review cards signed **History Agent** (`live-03`).
5. Concurrency: three more agent edits ran while `ana` typed ` <ANA-CONCURRENT>…`. Browser, agent inspect (revision 10) and server `Y.Doc` ended with the same text.
6. `ana` accepted the agent's replacement in the browser: open changes 7 → 6 on both sides.
7. `bruno` joined late in a second tab, saw the merged state and typed ` <BRUNO-LIVE>…` inside an agent paragraph (`live-04`).
8. Agent: `superdoc_inspect` with `findText` found bruno's text; `superdoc_save` exported the live room to a 9 KB DOCX whose body carries every edit; `superdoc_close` left the room intact (201 updates logged).

Traps found this round:

- The stock `@superdoc/mcp` is path-only; a room-aware MCP server is required (this spike's `mcp-server.ts`).
- Stateless Streamable HTTP needs a fresh `McpServer` + transport per request; sharing one transport answers the `initialized` notification with 500.
- The browser `trackChanges.decide` target is `{ kind: 'id', id }`; the entity shape from `trackChanges.list()` is rejected.
- A text run split by a tracked change no longer matches `has-text("owned by CAIO")`; click a run that is a single insertion instead.

## How it works

```ts
const client = createSuperDocClient({ user: { name: 'History Agent', email } });
await client.connect();
const doc = await client.open(
  { runtime: 'v2', collaboration: { providerType: 'hocuspocus', url, documentId, roomMode: 'join' } },
  { collaborationAuth: { type: 'token', token } },
);
await toolkit.dispatch(doc, 'superdoc_perform_action', { action: 'replace_text', edits: [{ find, replace }], changeMode: 'tracked' });
```

- The host is the embedded CLI binary shipped with the SDK; `@superdoc/cli` is not needed as a dependency.
- The token arrives in Hocuspocus `onAuthenticate({ token })`, so the app server needs a token path next to the cookie path in `authenticateMember`.
- Every update the agent produces is appended with the agent connection's user id, which is the history's `observed` identity tier. That is enough for attribution: the agent owns its socket.

## Traps

- **`runtime: 'v2'` is mandatory.** Without it the `collaboration` block is accepted and silently ignored: the host opens a local session, never connects, and the room on the server stays empty. The collaboration code lives in the host's `src/lib/collaboration/v2-runtime.ts`.
- `roomMode: 'join'` refuses a room without a committed bootstrap (`no committed v2 collaboration room exists for join intent`). The server must restore the room state in `onLoadDocument`; the app already does, the spike keeps it in memory.
- The host announces **no awareness state** (`awareness.getStates()` is empty for the agent socket). The `declared` tier never fires for the agent; attribution comes from the `observed` tier only.
- `query.match` takes `select: { type: 'text', pattern }`, not `text`.
- `perform_action` action names are `insert_paragraphs`, `replace_text`, `insert_heading`, … (`insert` does not exist).
- `collaboration.token` is rejected; use `collaborationAuth` per open (feature `collaboration.auth.perOpen`) or `tokenEnv`.

## Not tested

- Concurrent human typing while the agent edits (convergence was proven for humans in the proof of concept, removed on 2026-10-17; the agent is one more Yjs client).
- Agent sessions kept open across many tool calls (each test opens and closes).
- Cookie-based authentication; the spike server authenticates by token only.
