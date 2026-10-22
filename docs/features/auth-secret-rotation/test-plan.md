# Test plan: AUTH_SECRET rotation

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/auth/secret-rotation.test.ts::without the previous secret the signing key from before the rotation cannot issue tokens` — input: a JWT key created under one secret, a server restarted under another with no previous secret; expected: connecting an AI client rejects — evidence: red c57763a0 (6 failing), green 43779e8a
- [x] Confirmed it fails for the right reason: before the change the test server ignored the secrets, so the client connected and the expectation of a rejection failed — evidence: c57763a0

## Unit

- [x] `apps/server/src/config/environment.test.ts` — unset or empty `AUTH_SECRET_PREVIOUS` is null, a 32-character value is read, a short one throws naming the variable — evidence: 43779e8a
- [x] `apps/server/src/documents/share-links-routes.test.ts::links issued under the previous secret keep their URL and keep resolving after a rotation` — evidence: 43779e8a
- [x] `apps/server/src/documents/share-links-routes.test.ts::a link rotated after the secret rotation is issued under the current secret` — evidence: 43779e8a
- [x] `apps/server/src/auth/secret-rotation.test.ts::an AI app connects after the secret rotates when the previous secret is kept` — evidence: 43779e8a

## Production

- [ ] After the rotation and deploy: a share link created before still opens the document; an AI app connection still works; the demo account signs in again.
