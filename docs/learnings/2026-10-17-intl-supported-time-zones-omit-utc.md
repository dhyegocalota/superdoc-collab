# `Intl.supportedValuesOf('timeZone')` does not list `UTC`

- Date: 2026-10-17
- Inspired by: the invite-only server lane: `signUpSchema` validated the browser zone with `Intl.supportedValuesOf('timeZone').includes(value)` and refused `UTC`, which the seed, the test server and every browser set to UTC send
- Revisited: 2026-10-17 — `isSupportedTimeZone` in `libs/types/src/auth.ts` accepts `UTC_TIME_ZONE` explicitly; `auth.test.ts` pins it

## Signal
Sign-up answers 400 `Invalid input.` for a user, a seed or a test whose zone is `UTC`, while `America/Sao_Paulo` works.

## Cause
The list is the canonical IANA zones; Node 24 returns 418 of them and `UTC` (an alias, though `Intl.DateTimeFormat().resolvedOptions().timeZone` reports it) is not among them.

## Do
Validate a zone against the list plus `UTC`, or by constructing `Intl.DateTimeFormat` with it inside `try`; pin `UTC` in the zone test next to a regional zone and an invalid one.

## Anchor
`libs/types/src/auth.ts`, `libs/types/src/auth.test.ts`
