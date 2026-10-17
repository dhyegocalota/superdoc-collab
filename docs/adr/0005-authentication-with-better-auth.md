# 0005. Authenticate with Better Auth

- Status: Accepted Open sign-up and the seeded demo users are amended by [0020](0020-invite-only-accounts-with-a-first-claim-admin.md).
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: take-home specification, [0002](0002-authorship-observed-vs-declared.md), [0004](0004-stack.md)

## Context

The take-home lists real authentication as out of scope, but the owner wants it. Authorship ([0002](0002-authorship-observed-vs-declared.md)) rests on an authenticated socket. In the POC the Hocuspocus token was the user's email, which proves nothing.

## Decision

- Email and password authentication with Better Auth on SQLite.
- The Better Auth session token replaces the email token on the Hocuspocus socket; `onAuthenticate` validates the session.
- The awareness rule from 0002 stays: a declared identity requires awareness `userId` equal to the socket user.
- Demo users Ana, Bruno, Caio and Dani are seeded with a known password for multi-tab demos.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Magic link | No password handling | Email delivery needs a managed service (forbidden) or self-hosted SMTP (Mailpit) | Operational weight with no demo value |
| Email as token (POC) | Zero setup | No authentication | Attribution would be spoofable |
| No auth | Least work | Contradicts the owner's wish | Owner wants real auth |

## Consequences

- Credential endpoints need rate limiting and enumeration-safe responses.
- A seeded known password exists only for demo users and must not ship to a real deployment.

## Evidence

- The POC proves the socket-bound attribution model with a stand-in token ([POC results](../../poc/RESULTS.md)); the session-token path is new work.

## Revisit when

- The spec requires SSO or a managed identity provider.
- Outbound email becomes available without a managed service.
