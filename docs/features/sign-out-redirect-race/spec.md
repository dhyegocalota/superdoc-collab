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

- Signing out navigates to the bare sign-in route (replace, with the signed-out marker) before the cached session is cleared and invalidated, so `RequireSession` is meant to be gone when the cache flips. The reorder alone narrows the race: the router applies the navigation in a transition that can yield after the cache notification. `sign-out-flush-sync` closes it.
- Sign-out calls the auth client first. What a failure does depends on its kind; see Failure handling.

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

- The auth client throws (a network error): nothing else runs, the reader stays on the page with the cached session.
- The auth client resolves with an error object (an HTTP error such as a 5xx; it throws only on a network error): the hook carries on, navigates to sign-in and the invalidation refetches a session that is still valid, so `RedirectIfSession` sends the reader back to the documents list, still signed in. On main the sign-in form stayed up while the reader was still signed in; this is better, not worse.
- The invalidation fails after the navigation: the user is already on sign-in and the cached session is `null`.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Navigate first, or mark the sign-out in `RequireSession`? | reorder in the hook; a flag read by `RequireSession` | reorder: the smaller change, no new state | 2026-10-18 |
| Check the sign-out result? | check the returned error; set the client to throw; leave as is | not taken: out of scope for the race, and the HTTP-error outcome above is acceptable. Option for a later lane. | 2026-10-18 |

## Test strategy summary

- Unit (red first): at the moment the hook navigates, the cached session still holds the user; afterwards it is `null`.
- The existing sign-out flow tests stay as the guard.
