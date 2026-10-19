# Sign-out commits the sign-in route before the session flips

**Status:** Shipped 2026-10-18
**Lane:** product
**Tier:** 🟢
**Owner approval:** approved 2026-10-18
**ADRs:** none
**Not changing:** `RequireSession`, `RedirectIfSession`, the sign-out state marker, the auth client call and the session query options.

## Problem

`sign-out-redirect-race` made `useSignOut` navigate before it clears the cached session, but two reviews after the merge showed the race is narrowed, not closed. react-router 8.4's `RouterProvider` applies router state inside `React.startTransition` unless `flushSync` is set, and `main.tsx` imports `RouterProvider` from `react-router`, where `flushSync` is unavailable. TanStack notifies `setQueryData(null)` through `setTimeout(0)`. When the transition yields first (a sign-in render of 5 ms or more under load), `RequireSession` on the still-mounted old route renders `<Navigate to="/sign-in?next=%2Fdocuments" replace>`. `RequireAdmin` shares the exposure. `RedirectIfSession` is safe.

## Goals

- The sign-in route is committed synchronously before the cached session flips, whatever the sign-in render time.
- `RequireSession` and `RequireAdmin` never see a null session while mounted during sign-out.

## Non-goals

- Changing how `RequireSession` or `RequireAdmin` build the `next` path.
- Moving the other `RouterProvider` users in tests off `react-router`.

## Design

### Data flow

1. `authClient.signOut()`.
2. `navigate(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE, flushSync: true })`; the route commits synchronously.
3. `setQueryData(SESSION_QUERY_KEY, null)` then `invalidateQueries`, as before.

### Interfaces

`main.tsx` and the test helpers import `RouterProvider` from `react-router/dom`, which wires `flushSync` to `react-dom`. `useSignOut()` keeps its signature.

### Failure handling

Unchanged from `sign-out-redirect-race`.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Close the race in the hook or in the guards? | flush the navigation in the hook; teach both guards about sign-out | flush in the hook: one place, no new state | 2026-10-18 |

## Test strategy summary

- Unit (red first): a sign-in route that renders for 10 ms, signing out; the router never visits a location with `next`.
- The order pin and the menu-item options pin stay.
