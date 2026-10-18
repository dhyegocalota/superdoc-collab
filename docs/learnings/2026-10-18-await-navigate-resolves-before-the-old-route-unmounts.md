# `await navigate()` resolves before the old route unmounts, so a null session still reaches the guard

- Date: 2026-10-18
- Inspired by: two reviews of `sign-out-redirect-race` (PR #60) whose probe visited `/sign-in?next=%2Fdocuments` when the sign-in render took 5 ms or more
- Revisited: 2026-10-18 — still true
- Revisit when: a loader, lazy route or middleware is added to the sign-in route or to a guarded route, or react-router changes `handleLoaders`

## Signal
After sign-out the router visits `["/sign-in", "/sign-in?next=%2Fdocuments"]` although the hook navigated to the bare route before clearing the cached session. It shows only under load or with a slow sign-in render.

## Cause
react-router 8.4's `RouterProvider` applies router state inside `React.startTransition` unless `flushSync` is set. The core `RouterProvider` takes a `flushSync` prop and the `react-router/dom` entry only injects `ReactDOM.flushSync` into it, so importing from `react-router` leaves it unset. A transition can yield after a time slice of about 5 ms. TanStack Query notifies `setQueryData` through `setTimeout(0)`. If the transition yields first, the old route is still mounted when the session turns null, and `RequireSession` or `RequireAdmin` renders a `Navigate` to sign-in with `next`.

## The trap inside the fix
`flushSync` reaches the final commit only on the no-loader short-circuit in react-router's `handleLoaders`. Once a route has a loader, lazy route or middleware, the `completeNavigation` that runs after the load drops `flushSync` and the race reopens. A loader on the sign-in or a guarded route must be paired with another guard.

## Do
Import `RouterProvider` from `react-router/dom` and pass `flushSync: true` to a `navigate` that must commit before the next state change. Test it with a destination element that busy-renders for more than 5 ms; an order-only test passes either way.

## Anchor
`apps/web/src/features/auth/use-sign-out.ts`, `apps/web/src/main.tsx`, `apps/web/src/features/auth/sign-out-flow.test.tsx` ("a sign-in route that renders slowly still ends on the bare sign-in route"), commits `8efe42b6`, `7f798e83`
