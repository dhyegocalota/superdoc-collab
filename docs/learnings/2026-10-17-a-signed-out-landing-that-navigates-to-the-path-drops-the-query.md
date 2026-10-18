# Sign in after an ended session lands on the documents list instead of the document

- Date: 2026-10-17
- Inspired by: the connection-state tester's removed-session walk (`docs/features/connection-state/tester-briefing.md`, "Sign in after an ended session lost `next`")
- Revisited: 2026-10-17 — still true; the fix keeps `location.search`

## Signal
The Failed banner's Sign in button opens the sign-in page with `?next=` set, yet the address bar shows the page without it, and signing in opens the documents list.

## Cause
`RedirectIfSession` handles the signed-out landing by replacing the URL with `location.pathname` alone, which discards the query string. The guard's own unit tests rendered it without a query, so nothing failed.

## Do
Rebuild a replaced location from `pathname + search` whenever a redirect keeps the user on the same route, and give the test a route that carries a query. Build the sign-in path in one place (`signInPathFor`).

## Anchor
`apps/web/src/features/auth/redirect-if-session.tsx`, `redirect-if-session.test.tsx`, `sign-in-path.ts`, commits `d6ca58c`, `461ea7c`, `18fd65e`, `d283caf`
