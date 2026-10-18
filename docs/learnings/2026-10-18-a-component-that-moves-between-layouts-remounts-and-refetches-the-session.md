# A component rendered in one of two slots by a media-query flag remounts at the breakpoint and refetches the session

- Date: 2026-10-18
- Inspired by: the summary-mobile gate: `e2e/connection-state.spec.ts` "the banner reads well at eight widths" failed with a null banner in 9 s
- Revisited: 2026-10-18 — still true; the version bar now takes the time zone as a prop
- Revisited: 2026-10-18 — changed because the session query now has a five minute stale time (`session-stale-time`): a remount no longer refetches `/api/me`, while focus and reconnect still do; passing session-derived values as props is still the safer shape
- Revisited: 2026-10-18 — still true; a session read that turns null while `RequireSession` is mounted starts a `next` redirect, and sign-out now avoids it by committing the sign-in route synchronously first (`sign-out-flush-sync`)

## Signal
After the session is gone, resizing the window across a breakpoint makes the document page vanish: the page snapshot is the Sign in page and a test that looks for the connection banner finds nothing. With a valid session nothing is visible.

## Cause
The version bar was rendered in one slot below `lg` and another from `lg`, chosen by a media-query hook. Crossing the breakpoint unmounts it in one slot and mounts it in the other. It called `useTimeZone`, which reads the session query, and a query observer that mounts on a stale query refetches `/api/me`. With the cookie removed that request answers 200 with a null user and `RequireSession` redirects to sign in.

## Do
A component that moves between layouts takes session-derived values (time zone, user) as props from a parent that stays mounted, or keeps one mount position. Pin it with a test that switches the viewport and counts the `/api/me` requests.

## Anchor
`apps/web/src/features/editor/document-page.tsx` (`versionBar`), `apps/web/src/features/versions/version-banner.tsx`, `apps/web/src/lib/use-time-zone.ts`, `e2e/connection-state.spec.ts` ("the banner reads well at eight widths"), `apps/web/src/features/versions/time-travel.test.tsx` (the session request count), commits `5c5b44e`, `521901c`
