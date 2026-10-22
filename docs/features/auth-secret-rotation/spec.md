# AUTH_SECRET rotation

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-22 (owner, translated: "regenerate AUTH_SECRET, but keep the user invites with the same link")
**ADRs:** [0051](../../adr/0051-rotating-auth-secret-keeps-the-previous-secret.md)
**Not changing:** invites (their tokens never used the secret), password reset links, the room token format, the session lifetime

## Problem

Railway's security incident of 2026-10-21 may have exposed service variables, `AUTH_SECRET` among them. With the secret, someone who knows a document id and a member's id can mint a room token and read or edit that document as that member. Rotating it under ADR 0017 would break every share link already sent and every AI app connection, and real users depend on both.

## Goals

- A new `AUTH_SECRET` stops the old one from opening rooms.
- Share links sent before the rotation keep their URL and keep working; links rotated afterwards use the new secret.
- AI app connections keep issuing tokens after the rotation.

## Non-goals

- Keeping sessions: everyone signs in again once, which also drops any session cookie signed under the old secret.
- Rotating twice while the previous secret is still set.

## Design

### Data flow

`AUTH_SECRET_PREVIOUS` (optional) reaches `Environment.previousAuthSecret`. `ShareLinksRepository` accepts a stored link whose hash derives from either secret and keeps its URL; `writeNonce` issues under the current one. `createAuth` passes better-auth `secrets: [{ version: 1, value: AUTH_SECRET }]` and `secret: AUTH_SECRET_PREVIOUS`, so it signs with the new secret and decrypts the JWT key the old one encrypted. Room, bootstrap and public tokens and pseudonyms use only `AUTH_SECRET`.

### Interfaces

- Environment: `AUTH_SECRET_PREVIOUS`, at least 32 characters when set; empty or unset means no rotation.
- Runbook: one `railway variables` call moves the current value to the previous one and sets a new one.

### Failure handling

- A short `AUTH_SECRET_PREVIOUS` stops the server at boot with `ShortEnvironmentSecretError` naming the variable.
- Without `AUTH_SECRET_PREVIOUS` after a rotation, AI clients cannot get new tokens; the test pins that failure.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Rotate AUTH_SECRET with real users? | rotate and break links / keep the secret / rotate keeping links | rotate keeping the invite links | 2026-10-22 |
