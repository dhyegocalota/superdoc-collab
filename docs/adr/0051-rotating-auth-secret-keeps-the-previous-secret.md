# 0051. Rotating AUTH_SECRET keeps the previous secret for what it already issued

- Status: Accepted
- Date: 2026-10-22
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0017](0017-share-links-reissued-when-the-secret-changes.md) (its "Revisit when" named a versioned secret), [0025](0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md), Railway's security incident of 2026-10-21, which may have exposed service variables

## Context

`AUTH_SECRET` signs session cookies, room, bootstrap and public room tokens, the public pseudonyms, and every share link; better-auth also encrypts the JWT signing key of the AI app connections with it. Holding the secret alone lets someone mint a room token for a document and a member whose ids they know, and read or edit that document as that member. Rotating it under ADR 0017 broke every share link already sent, and broke the AI app connections because the stored signing key no longer decrypts. Real users rely on both.

## Decision

- An optional `AUTH_SECRET_PREVIOUS` holds the secret being replaced; `AUTH_SECRET` holds the new one. Unset, everything behaves as before.
- Room, bootstrap and public room tokens, pseudonyms and session cookies use only `AUTH_SECRET`, so the old secret stops opening rooms the moment the new one is live.
- A share link resolves and keeps its URL when its stored hash was derived from either secret; new and rotated links are issued under `AUTH_SECRET`. A link under neither is reissued on read, as in 0017.
- better-auth receives `secrets: [{ version: 1, value: AUTH_SECRET }]` with `secret: AUTH_SECRET_PREVIOUS`, so it signs with the new secret and still decrypts the JWT signing key the previous one encrypted.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Rotate with no previous secret (ADR 0017) | no new variable | every share link and AI connection breaks for real users | the owner keeps the links |
| A dedicated share-link secret | purpose-separated keys | a second permanent secret, and the AI key still breaks | the previous secret solves both with one optional variable |
| Re-encrypt the JWT key and re-sign links at boot | old secret can be dropped right away | boot rewrites data under whatever secret is configured | lazy acceptance is idempotent and needs no maintenance step |

## Consequences

- A rotation signs everyone out once; share links, invites, password reset links and AI app connections keep working.
- The previous secret cannot open rooms; with it alone nobody can forge a share link, because the nonce lives only in the database.
- Removing `AUTH_SECRET_PREVIOUS` later invalidates the links issued before the rotation and the JWT signing key; do it only together with a reset of that key.

## Evidence

- `apps/server/src/documents/share-links-routes.test.ts::links issued under the previous secret keep their URL and keep resolving after a rotation` and `::a link rotated after the secret rotation is issued under the current secret`.
- `apps/server/src/auth/secret-rotation.test.ts::an AI app connects after the secret rotates when the previous secret is kept` and `::without the previous secret the signing key from before the rotation cannot issue tokens`.
- `apps/server/src/config/environment.test.ts` covers the unset, set and short `AUTH_SECRET_PREVIOUS`.

## Revisit when

- A second rotation is needed while `AUTH_SECRET_PREVIOUS` is still set: links from two secrets ago would need a list, or a reissue first.
