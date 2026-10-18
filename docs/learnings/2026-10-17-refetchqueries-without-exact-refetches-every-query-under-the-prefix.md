# A query refetch fires more requests than the one query named

- Date: 2026-10-17
- Inspired by: the connection-state Reload review (`docs/features/connection-state/plan.md`, Reload step); the page test that pins the Reload refetch saw a third call after the Failed report began refetching members
- Revisited: 2026-10-17 — still true with TanStack Query in `apps/web`
- Revisited: 2026-10-18 — still true: summary-mobile changed `document-page.tsx` around the version bar and dim only; the Reload pins are untouched
- Revisited: 2026-10-18 — still true; `author-colours` adds no refetch

## Signal
After pressing Reload, the network panel shows the document's members, file and open requests all firing, although the code names only the open query and the file query.

## Cause
`queryClient.refetchQueries({ queryKey })` matches by prefix. Every query whose key starts with the given key refetches. Separately, a Failed report now refetches members on purpose, so a pin on the exact call list of Reload breaks when the two overlap.

## Do
Pass `exact: true` and `throwOnError: true` when one query is meant, assert the exact call list in the test, and start the assertion at the click so unrelated refetches before it do not count.

## Anchor
`apps/web/src/features/editor/document-page.tsx`, `document-page.test.tsx` (Reload pins), commits `f3deef0`, `68b73e4`, `a996f7f`, `0edb782`
