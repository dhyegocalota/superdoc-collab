# Tester briefing: AI presence avatar

Written by the developer when the steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/server/src/agent/agent-sessions.ts` — records when a person's tool call starts and ends; `presentUserIds(documentId)` answers who is running or ended less than the linger ago
- `apps/server/src/collaboration/collaboration-runtime.ts` — `onlineUserIds` counts human sockets only
- `apps/server/src/documents/documents-routes.ts` — the members answer gains `agents`
- `apps/server/src/config/environment.ts`, `apps/server/src/server.ts`, `.env.example`, `docker/docker-compose.yml`, `docs/install.md`, `e2e/stack.ts` — `AGENT_PRESENCE_LINGER_MS` (default 60 s; the E2E stack sets 4 s)
- `libs/types/src/documents.ts`, `libs/types/src/constants.ts` — `DocumentAgent`, `AGENT_PRESENCE_LINGER_MS`
- `apps/web/src/features/editor/members.tsx`, `members-copy.ts`, `use-members.ts` — the AI avatar after the humans
- Sibling files touched, minimal and additive: `document-page.tsx` and `editor-header.tsx` pass `agents` down; `tools/repository-shape` tests list the new variable

Payload: `{ members, agents: [{ user: { id, name }, name: "<Name> · AI", colorSlot, online: true }], isCurrentUserOnline }`.

## How to run

Start the scenario stack (the linger is 4 s there), sign in as Ana, connect an AI client and call the edit tool as `e2e/agent.spec.ts` does.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `apps/server/src/agent/agent-sessions.test.ts::a person's AI is present while a tool call runs and for the linger after it ends` | `presentUserIds is not implemented` | activity is recorded per person and document |
| `apps/server/src/collaboration/collaboration-runtime.test.ts::an agent socket does not make its person online, a human socket does` | `expected Set{ 'editor-1', 'editor-2' } to deeply equal Set{ 'editor-2' }` | agent sockets are filtered out |
| `apps/server/src/documents/members-routes.test.ts::members lists the AI of a member while it is present...` | `expected undefined to deeply equal [ { user: ..., } ]` | the route joins presence with membership |
| `apps/web/src/features/editor/members.test.tsx` (four AI tests) | `Unable to find an accessible element with the role "img" and name "Ana's AI, online"` | `Members` renders `agents` |

## Hypotheses to attack

1. Hypothesis: the owner is offline when only the AI is connected. Break it by: AI edit with every human tab closed, read the members as another member.
2. Hypothesis: the AI avatar leaves within linger plus one poll. Break it by: read the avatar at 59 s and 70 s in production defaults.
3. Hypothesis: the owner's AI is never merged with the owner. Break it by: owner with two tabs and two AI clients.

## Known gaps

- The E2E spec was written, not run, by the developer.
- A call queued behind another call of the same person counts as present only once it starts.
