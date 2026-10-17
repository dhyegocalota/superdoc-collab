# 0002. Bind Yjs clientIds to users in two tiers

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: POC results (removed 2026-10-17), relay attribution tests (removed 2026-10-17)

## Context

Each SuperDoc tab is a Yjs client with a random clientId, and every inserted struct carries it. The socket is authenticated: `onAuthenticate` turns the token into a userId. Attribution must therefore map clientIds to users, and it must survive a relay: the server dies after broadcasting an update but before persisting it, and another client re-sends that update.

## Decision

Table `client_identities(document_name, yjs_client_id, user_id, source)`:

- `Observed`: the first socket that carried a struct from that clientId (`INSERT OR IGNORE`). Provisional.
- `Declared`: the client's own awareness state says `userId` equal to the authenticated socket user. Read from `document.connections[*].clients`, because the Hocuspocus awareness hook context is the document creator's, not the sender's. A declaration overrides an `Observed` row only, never another `Declared` one.

`resolveAuthorIds` maps the struct clientIds of an update to identities. An update with no structs (deletion-only) is attributed to the sending connection.

This closes the relay hole: a re-sent update keeps the original author's clientId, so it is not misattributed to the relaying socket once the author's identity is declared.

Known limitation: deletion-only updates in the same crash window stay attributed to the relaying socket. The fix is persist-before-broadcast inside Hocuspocus.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Attribute to the sending socket only | Trivial | Misattributes relayed updates | Breaks exact attribution after a crash |
| Trust a client-supplied author field | Simple | Spoofable | Client is untrusted |
| Observed tier only | No awareness dependency | Provisional binding can be wrong for a relayed first sighting | Leaves the relay hole open |

## Consequences

- Same user in two tabs yields two clientIds and one author.
- A struct clientId with no bound identity is an error, not a guess.
- Deletion-only updates remain attributable only to the sending connection.

## Evidence

- Unit tests in `poc/tests/node/relay-attribution.test.ts` force the relay scenario deterministically.
- E3: same user in two tabs, every connected client gets a `declared` identity.
- E6: two offline authors delete the same text; it is counted once.
- Chaos runs, including 9 SIGKILLs: 0 relayed updates observed.

## Revisit when

- Hocuspocus exposes the sender's context in awareness hooks.
- Persist-before-broadcast becomes available.
