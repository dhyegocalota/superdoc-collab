# A tracked edit through a cached SDK session returns ok and nothing reaches the update log
- Date: 2026-10-17
- Inspired by: reviewer finding on the L3 agent lane of agentic-history-mcp; `apps/server/src/agent/agent-sessions-room.test.ts`
- Revisited: 2026-10-17 — still true

## Signal
`replace_text` through an MCP tool answers `status: ok`, yet the update log does not grow and the browser shows no tracked change. It happens after a person is promoted from Reader to Editor, and after the room token expired and the socket reconnected.

## Cause
The room token and the read-only flag of the connection are fixed when the SDK opens the room. A cached session keeps both: a Reader session stays read-only after the promotion, and a reconnect presents the expired token, which the agent path refuses. The SDK applies the edit to its local copy and reports success.

## Do
Never reuse a session across a change of role, author name or token age. `AgentSessions` records the role, the name and `openedAt` at open and replaces the session when any differs or when it is older than the token lifetime minus the open timeout. Assert in tests that the update log grew, never only that the tool answered ok.

## Anchor
`apps/server/src/agent/agent-sessions.ts` (`isCurrent`), `apps/server/src/agent/agent-sessions-room.test.ts`, commits 7bceef5 (red) and fd38378 (green).
