# 0029. Agent edits carry an actor next to the user they act for

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [SDK room-join spike](../features/agentic-history-mcp/spike-sdk-room-join.md), [0002](0002-authorship-observed-vs-declared.md), [learning: runtime v2](../learnings/2026-10-17-sdk-collaboration-is-silently-ignored-without-runtime-v2.md)

## Context

The [agentic-history-mcp](../features/agentic-history-mcp/spec.md) feature lets a person connect an AI client (Claude Code, Cursor, ChatGPT) that edits the live document on their behalf. The owner requires that every edit made by a person's AI is visibly marked as such in the history and in tracked changes, while still counting as that person's contribution.

[0002](0002-authorship-observed-vs-declared.md) binds Yjs clientIds to users in two tiers: `Observed` (first socket that carried the struct) and `Declared` (awareness `userId` equals the socket user). The spike showed that the `@superdoc/sdk` host announces no awareness state, so an agent socket only ever reaches the `Observed` tier, and that the tracked-change author name is the `user.name` the SDK client was created with.

## Decision

- A new enum `ClientActor { Human = 'human', Agent = 'agent' }` in `libs/types`. The collaboration context becomes `{ userId, documentId, actor }`: the cookie path sets `Human`, the agent path sets `Agent`.
- The update log stores `connection_actor` on every update and `actor` on every `client_identities` row. `append` takes the actor as a required argument. The migration backfills `human` on existing rows, which is a fact: no agent could connect before this decision.
- The two tiers stay as they are. An agent clientId is bound by `Observed` only, which is enough because the agent owns its socket. A declaration overrides an `Observed` row only when the actors match, so a human declaration never turns an agent clientId into a human one. The user may differ: that is the relay correction of 0002, where a human's declaration fixes a row another human's socket relayed.
- Read model and timeline carry the actor per event. The author key of an agent is `<userId>#agent`; `EventAuthor` gains `actor` and keeps `id = userId`, so filtering by a person includes their AI, and the AI still appears as its own contributor.
- Actions with no Yjs update (revealing or rotating a share link, exporting) are recorded in `agent_actions(document_name, user_id, kind, created_at)` with `kind` from `AgentActionKind { ShareLinkRevealed, ShareLinkRotated, DocumentExported }`, and drawn as marks on the timeline axis.
- Each agent session is opened with `userName: "<name> · AI"` and the person's email, so tracked-change cards name the AI without web code. One SDK host serves every person: the name is per open, not per host.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Actor next to the user (chosen) | the AI counts as the person's work and stays separable; one column per table; filters keep working | every reader of authors must handle the actor; the author key format changes for agents | — |
| Same author with a per-event flag only | smallest change | "how much did the AI write" has no number; nothing in the author list shows the AI | the owner wants the AI visible in the authors, not only per event |
| Independent agent author ("History Agent for Ana") | no schema change; works today | the person disappears from the authorship of what their AI wrote; no filter inheritance | breaks "on behalf of" |
| A third identity tier for agents | symmetric with 0002 | tiers answer "how sure are we of the user", not "who typed"; mixing the two questions in one column | the actor is orthogonal to the tier |

## Consequences

- One migration in the history database and one in the read model.
- `EventAuthor`, `TimelineCell` and the contributor views change shape; the web groups an agent contributor under its person.
- Known limitation, inherited from 0002: if the server dies after broadcasting an agent update and a human socket relays it first, the clientId is observed on the human socket and, since the agent never declares, stays attributed to the human. Persist-before-broadcast closes it for both.
- A run written by both a human and an agent (only possible through a relay or a reconnect sync) counts as human volume in a timeline cell, while the contributors list still credits the agent key.
- The opposite case, a human clientId first observed through an agent socket, is unreachable today because the SDK host lives in the server process and never relays a browser's structs.

## Evidence

- Spike S2 and M9: every agent update carried the agent connection's user id (7 of 7, then 56 of 56).
- Spike S3 and M4: the tracked-change author equals the name the SDK announces.
- Probe on the spike stack, 2026-10-17: two sessions on one host opened with `userName` "Ana · AI" and "Bruno · AI" produced tracked changes signed with their own names.

## Revisit when

- The SDK host starts announcing awareness, which would let an agent declare.
- A second kind of non-human actor appears (an in-app panel, a scheduled job).
