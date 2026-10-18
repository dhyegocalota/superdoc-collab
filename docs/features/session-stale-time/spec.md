# The session query is fresh for five minutes

**Status:** Building
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the lead's request after the summary-mobile gate caught a sign-in redirect caused by a remount)
**ADRs:** none; the stale time is a constant, not a decision with alternatives
**Not changing:** the sign-in and sign-up invalidation of the session, the time zone save's invalidation, the server session endpoint, `RequireSession` and `RedirectIfSession`.

## Problem

`useSession` has no stale time, so every component that mounts and reads the session or the time zone (about ten each) refetches `/api/me`. A component that remounts across a breakpoint therefore asks the server again, and with the cookie gone the answer (200 with a null user) redirected the page to sign-in (learning 2026-10-18, "a component that moves between layouts remounts and refetches the session"). A related gap: sign-out never touches the session query, so pages can keep showing the old user.

## Goals

- The session query is fresh for five minutes: consumers mounted one after the other fetch `/api/me` once.
- Sign-out sets the cached session to signed out and invalidates it, so no page shows the old user.
- The session still refetches when the window gets focus and when the browser comes back online, even inside the stale window, so an ended session is noticed on returning to the tab as before.

## Non-goals

- A global default stale time for other queries.
- Refetch on window focus changes.

## Design

### Data flow

1. `SESSION_STALE_TIME_MS` in `libs/types/src/constants.ts`, five times the shared minute constant, passed as `staleTime` of the session query in `use-session.ts`.
2. `use-sign-out.ts`: after the auth client signs out, `setQueryData(SESSION_QUERY_KEY, null)`, then `invalidateQueries({ queryKey: SESSION_QUERY_KEY })`, then navigate to sign-in.
3. The session query sets `refetchOnWindowFocus: 'always'` and `refetchOnReconnect: 'always'`; a resize fires no focus event, so the remount dedupe stays.

### Interfaces

- `SESSION_STALE_TIME_MS` exported from `@superdoc-collab/types`.
- `fetchMe(): Promise<SessionUser | null>` unchanged in type.

### Failure handling

- The server answers 200 with `{ user: null }` when signed out (`apps/server/src/http/me.ts`), so an ended session reads as `null` at the next refetch and `RequireSession` redirects.
- A 5xx or a network failure: the query errors and keeps the last good user, as before.
- A session that ends on the server while the socket is alive is noticed on window focus, on the next session refetch (stale time, sign-in, time zone save, reload) or when the transport drops. The members poll does not notice it: `use-connection-state.ts` turns the poll's 401 into Failed only during an outage (ADR 0032).

### Known gaps, for the owner

- A sign-out in another tab leaves an open editor writable as the old user until a focus or five minutes; the server never closes sockets on sign-out, so the root fix is a server-side lane.
- Option B: a members 401 invalidating the session would send the user to sign-in, but it would redirect mid-edit away from a document whose socket still works.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| How long is the session fresh? | one minute, five minutes, until invalidated | five minutes, from the shared minute constant | 2026-10-18 |

## Test strategy summary

- Unit (red first): two consumers fetch once; a focus and a reconnect refetch inside the stale window; a failed refetch keeps the last good user; sign-out sets and invalidates the session.
- E2E: the existing connection-state and sign-out specs are the guard; no new spec.
