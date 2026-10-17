# Sign-in keeps the next path

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-17 ("fix os 5 achados", defect 2 of the first `/scenario core-realtime` walk)
**ADRs:** none
**Not changing:** `safeNextPath` (it already allows same-origin paths), `RequireSession`, the share landing page.

## Problem

A signed-out user who opens `/share/<token>` is sent to `/sign-in?next=%2Fshare%2F<token>`, signs in, and lands on `/documents` instead of the shared document. `useAuthSubmit` does navigate to `safeNextPath(next)` after the session query refetches, but `RedirectIfSession`, which wraps the sign-in page, renders `<Navigate to="/documents">` the moment the refetched session carries a user, which happens before the submit's own navigation. The existing E2E for `next` only used `/documents`, so both paths looked the same.

## Change

`RedirectIfSession` redirects a signed-in user to `safeNextPath(searchParams.get('next'))` instead of `AppRoute.Documents`. `safeNextPath` keeps the origin check, so a foreign `next` still goes to `/documents`.

## Tests

- Unit `redirect-if-session.test.tsx`: a signed-in user with `?next=/share/token-1` renders the share route, not documents; a foreign-origin `next` still renders documents.
- E2E `auth.spec.ts`: a signed-out member opens a share link, is sent to sign-in with `next`, signs in and lands on the shared document.
