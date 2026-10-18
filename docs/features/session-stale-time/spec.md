# The session query is fresh for five minutes

**Status:** Building
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the lead's request after the summary-mobile gate caught a sign-in redirect caused by a remount)
**ADRs:** none; the stale time is a constant, not a decision with alternatives
**Not changing:** the sign-in and sign-up invalidation of the session, the time zone save's invalidation, the server session endpoint, `RequireSession` and `RedirectIfSession`.

## Problem

`useSession` has no stale time, so every component that mounts and reads the session or the time zone (about ten each) refetches `/api/me`. A component that remounts across a breakpoint therefore asks the server again, and with the cookie gone the 401 redirected the page to sign-in (learning 2026-10-18, "a component that moves between layouts remounts and refetches the session"). Two related gaps: sign-out never touches the session query, and a 401 from `/api/me` becomes a query error that keeps the last good user, so consumers still see the old user.

## Goals

- The session query is fresh for five minutes: consumers mounted one after the other fetch `/api/me` once.
- Sign-out sets the cached session to signed out and invalidates it, so no page shows the old user.
- A 401 from `/api/me` reads as a signed-out session (`null`), not as a stale user. Any other failure still rejects.

## Non-goals

- A global default stale time for other queries.
- Refetch on window focus changes.

## Design

### Data flow

1. `SESSION_STALE_TIME_MS` in `libs/types/src/constants.ts`, five times the shared minute constant, passed as `staleTime` of the session query in `use-session.ts`.
2. `use-sign-out.ts`: after the auth client signs out, `setQueryData(SESSION_QUERY_KEY, null)`, then `invalidateQueries({ queryKey: SESSION_QUERY_KEY })`, then navigate to sign-in.
3. `fetchMe` catches `AuthenticationError` only and returns `null`; every other error is rethrown.

### Interfaces

- `SESSION_STALE_TIME_MS` exported from `@superdoc-collab/types`.
- `fetchMe(): Promise<SessionUser | null>` unchanged in type.

### Failure handling

- A 401 on the first read: the user is `null`, consumers redirect to sign-in as before.
- A 401 on a later refetch: the cached user becomes `null`.
- A 5xx or a network failure: the query errors and keeps the last good user, as before.
- The session ending on the server while the cache is fresh is noticed at the next refetch (stale time, sign-in, time zone save) or by the features that already watch it (the members poll).

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| How long is the session fresh? | one minute, five minutes, until invalidated | five minutes, from the shared minute constant | 2026-10-18 |

## Test strategy summary

- Unit (red first): two consumers fetch once; a 401 first read and a 401 refetch read as signed out; another failure stays an error; sign-out sets and invalidates the session; the constant is five minutes.
- E2E: the existing connection-state and sign-out specs are the guard; no new spec.
