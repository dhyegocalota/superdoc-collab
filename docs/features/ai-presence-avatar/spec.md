# AI presence avatar

**Status:** Shipped 2026-10-21
**Tier:** 🟡
**Owner approval:** approved 2026-10-21
**ADRs:** [0028](../../adr/0028-the-actor-not-the-name-marks-an-ai-in-our-interface.md), [0029](../../adr/0029-agent-edits-carry-a-human-or-agent-actor.md), [0032](../../adr/0032-connection-state-truth-callback-for-transitions-server-presence-for-recovery.md)
**Not changing:** the SDK host socket and its idle close, the agent author key and its colour, who may edit, the jump-to-cursor behaviour for human members, the share dialog's "People with access" list

## Problem

When an AI client edits a document through MCP, nothing in the top bar says so. The AI edits through a host socket whose user is the owner, so the owner looks online for up to five minutes after an AI-only edit, and no avatar tells another member that an AI is at work.

## Goals

- While an AI is making changes, every member sees its avatar in the members row, different from a human's: the AI badge and the label "<Name>'s AI".
- The owner sees their own AI next to their own avatar, never merged with it.
- A human is online only from their own human socket; the AI socket no longer makes its owner look online.

## Non-goals

- Showing a cursor for the AI or jumping to it.
- Showing AI presence to visitors without membership (a sibling lane adds `visitors` to the same response).
- Changing the five-minute session idle close.
- Showing the avatar for a share-link rotation through MCP: it does not go through `sessions.run`, so it records no presence.

## Design

### Data flow

The AI tools run through `AgentSessions.run`. `AgentSessions` records, per person and document, the time the last tool call ended and whether one is running. `GET /api/documents/:id/members` lists an agent for every member whose AI is running a tool call or finished one less than `AGENT_PRESENCE_LINGER_MS` (60 s) ago. `onlineUserIds` ignores sockets whose actor is the agent; the MCP `list_members` tool uses it too, so the calling agent's own person shows offline unless that person has a human socket. The web reads the `agents` list from the same 5 s members poll.

### Interfaces

```
GET /api/documents/:id/members
{
  members: DocumentMember[],
  agents: DocumentAgent[],        // { user: { id, name }, name: "<Name> · AI", colorSlot, online: true }
  isCurrentUserOnline: boolean
}
```

`AGENT_PRESENCE_LINGER_MS` lives in `libs/types/src/constants.ts`; `AgentSessions` reads it directly, and unit tests move the clock through its `now` option. The agent's colour slot is the one of its author key, which resolves to the owner's slot.

Web: agents render after the humans, `UserAvatar` with `isAgent`, key by `<userId>#agent`, accessible name "<Name>'s AI, online", not a button (no caret, no jump). The current user's own AI is shown. Agents always stay visible after the `+N` menu and are never folded into it; the group's online count includes them.

### Failure handling

- A revoked consent ends the AI's calls; the avatar goes after the linger.
- A removed member's AI is not listed (agents are filtered by current membership).
- A failed tool call still counts as activity; the linger starts when the call ends either way.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Should the AI avatar show while only the session is open? | session idle (5 min) / tool call plus 60 s | tool call plus 60 s | 2026-10-21 |
| Should the owner's own AI be hidden as a duplicate of the owner? | hide / show | "even if it is mine, I must see my AI there besides myself" | 2026-10-21 |

## Test strategy summary

Unit: `AgentSessions` activity and linger with an injected clock; the runtime ignores agent sockets; the members route lists agents; `Members` renders, keys and does not make the AI jumpable. E2E: the AI client edits and its avatar appears beside the owner's.
