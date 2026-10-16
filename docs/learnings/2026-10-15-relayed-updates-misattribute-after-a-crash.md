# After a server crash, text typed by one author is attributed to whoever reconnected first
- Date: 2026-10-15
- Inspired by: docs/adr/0002-authorship-observed-vs-declared.md; poc/tests/node/relay-attribution.test.ts
- Revisited: 2026-10-16 — still true

## Signal
The server dies after broadcasting Ana's update but before persisting it. After restart, Bruno's client re-sends Ana's structs and the history shows Ana's text as Bruno's.

## Cause
The sending socket was used as the author. A relayed update carries another author's Yjs clientIds, so the socket is the wrong witness.

## Do
Bind each Yjs clientId to a user in two tiers. Observed is the connection that first sent structs for that clientId; declared comes from the owner's awareness on its own authenticated socket. Declared wins over observed and never over another declared. Deletion-only updates have no structs and stay attributed to the sending socket; that is a known limit recorded in ADR 0002.

## Anchor
- `poc/lib/update-log.ts` — `IdentitySource`, `declareClientIdentity`
- `poc/tests/node/relay-attribution.test.ts` — `a later declaration by the owner corrects the provisional binding`, `a declaration persisted before a crash wins over a relay after the restart`, `a declaration never overrides another declaration`
- `poc/tests/e10-hard-crash.spec.ts` — `E10: the server is SIGKILLed mid-typing several times; history stays exact`
- `docs/adr/0002-authorship-observed-vs-declared.md`
