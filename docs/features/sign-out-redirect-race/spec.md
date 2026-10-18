# Sign-out leaves the page before it clears the session

**Status:** Building
**Lane:** product
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 (the lead's request after a gate flake on main)
**ADRs:** none
**Not changing:** `RequireSession`, `RedirectIfSession`, the sign-out state marker, the auth client call and the session query options.

## Problem

`useSignOut` set the cached session to `null` before it navigated. `RequireSession` saw the null user and started a redirect to `/sign-in?next=<page>` first, which raced the sign-out navigation to the bare sign-in route. Under load the test "signing out lands on the bare sign-in route and stays there" read the URL inside that window (`expected '?next=%2Fdocuments' to be ''`), and a real reader could end up on a sign-in URL that returns to the page they left.

## Goals

- Signing out navigates to the bare sign-in route (replace, with the signed-out marker) before the cached session is cleared and invalidated, so `RequireSession` is gone when the cache flips and no `next` redirect can start.
- Sign-out still fails closed: the auth client signs out first, and a failure there changes nothing.

## Non-goals

- Changing how `RequireSession` builds the `next` path.

## Design

### Data flow

1. `authClient.signOut()`.
2. `navigate(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE })`; `RedirectIfSession` shows the form while the cache still holds the user and clears the cache itself.
3. `setQueryData(SESSION_QUERY_KEY, null)` then `invalidateQueries`, as before.

### Interfaces

None; `useSignOut()` keeps its signature.

### Failure handling

- The auth client rejects: nothing else runs, the user stays on the page with the cached session.
- The invalidation fails after the navigation: the user is already on sign-in and the cached session is `null`.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Navigate first, or mark the sign-out in `RequireSession`? | reorder in the hook; a flag read by `RequireSession` | reorder: the smaller change, no new state | 2026-10-18 |

## Test strategy summary

- Unit (red first): at the moment the hook navigates, the cached session still holds the user; afterwards it is `null`.
- The existing sign-out flow tests stay as the guard.
