# Tester briefing: Password reset link from the admin

## What changed and where

- Server: `apps/server/src/admin/password-reset-links.ts` (capture and `PasswordResets` service), `admin-routes.ts` (`POST /api/admin/users/:id/password-reset`), `users.ts` (`emailOf`), `auth/auth.ts` (`sendResetPassword` capture, one-hour expiry, sessions revoked on reset, `/request-password-reset` disabled), wiring in `server.ts`, `seed.ts` and `http/app.ts`.
- Shared: `libs/types/src/password-reset.ts`, `AppRoute.ResetPassword`, `resetPasswordPagePath`, `passwordResetApiPath`.
- Web: `Reset password` button on every Users row (`users-table.tsx`), `LinkCreatedDialog` shared with the invite dialog, public `ResetPasswordPage` at `/reset-password?token=`, `LinkInvalidCard` shared with the invalid-invite card, one route in `router.tsx`.
- E2E: `e2e/password-reset.spec.ts`. Rule fact added to `.claude/rules/collaboration.md`.

## How to run

- Server: `pnpm --filter @superdoc-collab/server exec vitest run src/admin`
- Web: `pnpm --filter @superdoc-collab/web exec vitest run src/features/admin src/features/auth src/app`
- E2E (port 3100 must be free): `pnpm exec playwright test e2e/password-reset.spec.ts`

## Red today, green after

- `password-reset-links.test.ts` (3 tests): `Error: PasswordResetLinkCapture.store is not implemented`.
- `admin-routes.test.ts`: link creation `expected 404 to be 201`; unknown user `expected { error: 'Not found' } to deeply equal { error: 'User not found' }`; public path `expected 400 to be 404`; reset flow `TypeError: Invalid URL`.
- `admin-page.test.tsx` (2 tests): no button named `Reset password`.
- `reset-password-page.test.tsx` (5 tests): `Error: ResetPasswordPage is not implemented`.
- `router.test.tsx`: the reset route test times out.

## Hypotheses for the tester

1. An admin gets a link on the app origin that carries a `token` query and expires in one hour; the dialog shows it once, read-only, with Copy link.
2. The link works once: the second use shows the invalid message with a link to Sign in.
3. After a reset the old password fails and the new one signs in; every other session of that user is gone.
4. A non-admin gets 401 or 403 from the route; the public `/api/auth/request-password-reset` answers 404 signed out and signed in.
5. The page without a token, with a wrong token, or with an expired token shows the invalid message; a password under eight characters shows the form's validation message and sends nothing.
6. The token and URL are never logged by the server code written here.
7. The page works for a visitor who is signed in elsewhere (no redirect away).

## Gaps

- The 500 path (capture empty after the call) has no test; it propagates the named error through the existing error handler.
- Token expiry by the clock is not exercised.
- Concurrent resets for the same user share one slot; the later request overwrites the earlier token before `take`, which is harmless because each request takes its own.
- 375 px layout, console and network cleanliness, and the adversarial claims in the test plan are for the tester.
