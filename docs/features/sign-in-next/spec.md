# Sign-in follows next — spec

- Status: Shipped 2026-10-17
- Tier: green (one redirect in the sign-in route).
- Owner approval: under the owner's "faça tudo sozinho" of 2026-10-17; found while checking `/admin` on the live instance after the invite-only deploy.
- Not changing: `safeNextPath`, the submit hook, the routes.

## Problem

`RedirectIfSession` sent every signed-in visit to `/sign-in` or `/sign-up` to `/documents`, ignoring `?next=`. Signing in from `/admin` or a deep link landed on the list, because the redirect re-rendered on the fresh session before the submit hook's own `navigate(next)`.

## Change

The redirect navigates to `safeNextPath(searchParams.get('next'))`, the helper the submit hook already uses; another origin or a protocol-relative path still falls back to `/documents`.

## Tests

- `redirect-if-session.test.tsx::a signed-in user goes to the page named by next` (red, then green).
- `redirect-if-session.test.tsx::a next pointing at another origin falls back to documents` (a pin: it passed before the fix, and guards the fallback).
