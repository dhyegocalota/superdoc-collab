# 0017. Share links are reissued when the signing secret changes

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0010](0010-documents-ownership-and-share-links.md) (two share links per document, owner rotation), the comment audit of 2026-10-17 (the rule lived only in `ShareLinksRepository.links`)

## Context

A share token is derived from the server's signing secret and a per-link nonce; the database keeps the nonce and the token hash, never the token. ADR 0010 covers rotation by the owner. It does not say what happens to every stored link when the secret itself changes, which it does when an operator rotates `AUTH_SECRET` or restores a database under a different environment.

## Decision

- When a document's links are read, any link whose stored token hash was not derived from the current secret and its nonce is reissued with a fresh nonce before the links are returned.
- `resolve` refuses a token whose stored hash was not derived from the current secret, so links from an old secret stop resolving the moment the secret changes, before any owner opens the document; the owner sees new links on the next open, and members already admitted keep their membership, exactly as on an owner rotation.
- Reissue happens lazily on read, not in a migration, so a secret change needs no maintenance step.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep old links valid by storing the token | no reissue | the token is a bearer secret at rest | a database dump would leak every link |
| Re-sign every link at boot | eager, one pass | boot work scales with documents; a boot under the wrong secret rewrites everything | lazy reissue costs one hash per link per read and is idempotent |
| Fail the read with a configuration error | loud | the owner cannot open the Share dialog until an operator acts | the product should keep working after a secret rotation |

## Consequences

- Rotating `AUTH_SECRET` is a supported way to invalidate every share link of every document at once.
- `ShareLinksRepository.links` carries an `NB ADR 0017` pointer; `isIssuedBySecret` is the check, used by `links` to reissue and by `resolve` to refuse.

## Evidence

- `apps/server/src/documents/share-links-routes.test.ts::links stored under another secret are regenerated and work` pins the reissue on read; `::a token issued under another secret stops resolving before any read reissues it` pins the refusal in `resolve` (added after the review of 2026-10-17 found that `resolve` matched the stored hash alone).

## Revisit when

- Secrets become per-document or come from a key-management service with versions, which would allow old links to keep resolving during a rotation window.
- Revisited 2026-10-22 by [0051](0051-rotating-auth-secret-keeps-the-previous-secret.md): an optional previous secret keeps links issued under it resolving through a rotation.
