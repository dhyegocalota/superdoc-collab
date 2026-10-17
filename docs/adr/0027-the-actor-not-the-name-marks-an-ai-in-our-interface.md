# 0027. The actor, not the name, marks an AI in our interface

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [ADR 0024](0024-agent-edits-carry-a-human-or-agent-actor.md), the security review of the reserved "· AI" name rule

## Context

The first design marked an AI by appending " · AI" to the person's name everywhere. That made a name a trust signal, so a person could register "Bob · AI" and look like an agent. The reserved-name rule at sign-up and update-user grew into a lookalike arms race (dot-like separators, confusable letters, invisible characters) that can never be complete.

## Decision

The marker comes from `EventAuthor.actor`, never from text. Our own interface renders the plain name plus an AI icon with `role="img"`, an accessible label and a tooltip "Edited by <name>'s AI". The server sends the plain name for agents. Selection summaries carry `{ name, actor }` per author, and the model prompt names an AI author "<name>'s AI". Names are free-form again.

Only the SDK session `userName` keeps the " · AI" suffix, because SuperDoc's tracked-change cards can show a name and nothing else.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep the suffix and reserve the names | one string everywhere | bypassable by lookalikes; locks out real names such as "Li Ai" | the name is not a trust boundary |
| Actor-driven icon, free names (chosen) | the signal is unforgeable by users; nothing to reserve | summaries need the actor; SuperDoc cards still show text | none |

## Consequences

- A person can still name themselves "Bob · AI". Inside our interface they show no icon. Inside SuperDoc's tracked-change cards the name is only text, so the residual is that a human-chosen "· AI" name looks like an agent there.
- `SelectionSummary.authors` changes from names to `{ name, actor }`; a migration clears the cached rows, which are recomputed on demand.
- `agentAuthorName` stays for the SDK session only.

## Evidence

`libs/types/src/auth.test.ts` (names accepted), `apps/web/src/features/timeline/contributor-avatars.test.tsx`, `author-names.test.tsx` and `selection-summary-card.test.tsx` (icon from the actor, not the name), `apps/server/src/insights/selection-summaries-service.test.ts` (prompt and stored actor).

## Revisit when

SuperDoc can render a custom author component or an actor flag in its cards.
