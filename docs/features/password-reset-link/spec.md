# Password reset link from the admin

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner: "cria link de recuperar senha pelo admin para um usuario")
**ADRs:** [0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md) (invite-only accounts; no email)
**Not changing:** sign-in, sign-up, the invite flow, the admin role rules

## Problem

Accounts are invite-only and the app sends no email, so a person who forgets their password is locked out. The admin needs to hand them a link that lets them choose a new password.

## Goals

1. In Admin → Users, every row gets a `Reset password` action. It creates a one-time link, shown once in a dialog like the invite link, with the copy button and the expiry.
2. The person opens the link signed out, chooses a new password (same rules as sign-up), and is signed in or sent to Sign in with a success notice. Every other session of that user is revoked, their open collaboration sockets are closed in every room, and their OAuth consents and tokens are deleted so connected agents lose access.
3. The link expires after `PASSWORD_RESET_TTL_MS` (1 hour) and works once.

## Design

- better-auth's own reset flow, so hashing, token storage and expiry stay in the library: `emailAndPassword.sendResetPassword` is implemented as a capture, not an email. `PasswordResetLinkCapture` (`apps/server/src/admin/password-reset-links.ts`) stores `{ nonce → token }` for the duration of one request, where the nonce is a fresh UUID passed as `redirectTo` and read back from the `callbackURL` of the `url` that better-auth hands to `sendResetPassword`, so simultaneous resets of one user never swap tokens; `requestPasswordReset` awaits the callback, so the admin route calls `auth.api.requestPasswordReset({ body: { email, redirectTo } })` and then `capture.take(nonce)`, which throws `PasswordResetLinkNotCapturedError` when nothing was stored. `resetPasswordTokenExpiresIn` is set from `PASSWORD_RESET_TTL_MS`.
- `POST /api/admin/users/:id/password-reset` (`admin-routes.ts`): 404 `USER_NOT_FOUND_MESSAGE` when the id is unknown; otherwise 201 `{ url, expiresAt }` where `url` is `${APP_ORIGIN}${resetPasswordPagePath(token)}` and the page route is `AppRoute.ResetPassword = '/reset-password'` with the token in `PASSWORD_RESET_QUERY_PARAMETER = 'token'`.
- The public page `ResetPasswordPage` (`apps/web/src/features/auth/reset-password-page.tsx`, no session, like Sign in) reads the token, shows the new-password form (reuse the sign-up form's password field and validation), calls `authClient.resetPassword({ newPassword, token })`, and on success navigates to Sign in with `PASSWORD_RESET_DONE_MESSAGE`; an invalid or expired token shows `PASSWORD_RESET_INVALID_MESSAGE` with a link to Sign in. A missing token shows the same message.
- Admin UI: `users-table.tsx` gains the action; `admin-api.ts` gains `createPasswordReset(userId)`; the created-link dialog is the invite dialog generalised (`LinkCreatedDialog` with title and description props, used by both callers) or a sibling with the same shape. Copy in `admin-copy.ts` and `auth-copy.ts`.
- `DISABLED_PATHS` stays; the reset paths (`/request-password-reset`, `/reset-password`) must not be callable by non-admins: `requestPasswordReset` is only called server-side, so the public `/api/auth/request-password-reset` endpoint is added to `DISABLED_PATHS` (the admin route calls `auth.api` directly, which bypasses the HTTP path); `/reset-password` stays public because the token is the credential.

### Failure handling

| Case | Behaviour |
|------|-----------|
| Unknown user id | 404 |
| Capture empty after the call | 500 with a logged `PasswordResetLinkNotCapturedError`, no link |
| Token reused or expired | the page shows `PASSWORD_RESET_INVALID_MESSAGE` |
| Weak password | the form's existing validation message |
| Public `request-password-reset` called | 404 (disabled path) |

## Test strategy summary

Server unit: the capture (store/take/throw), the route (201 with a URL on the app origin, 404 unknown, admin-only through the existing guard, public request path disabled). Web unit: the users table action, the dialog, the reset page states (form, invalid token, success). E2E `e2e/password-reset.spec.ts`: admin creates the link for Bruno, Bruno opens it signed out, sets a new password, signs in with it; the old password no longer signs in; the link used twice shows the invalid message.

## Deviations found while building (better-auth 1.7.10)

- `requestPasswordReset` takes `{ email, redirectTo? }`, not a user id. The route looks the email up with `AdminUsersRepository.emailOf` and omits `redirectTo`, because the app builds its own URL from the captured token. `sendResetPassword` receives `{ user, url, token }`; only `user.id` and `token` are used.
- `resetPasswordTokenExpiresIn` is in seconds, so it is `PASSWORD_RESET_TTL_MS / 1000`. `expiresAt` in the answer is the server clock plus `PASSWORD_RESET_TTL_MS`, not read back from the token row.
- `revokeSessionsOnPasswordReset` defaults to false; it is set to true, which is what ends the user's other sessions (goal 2).
- The client's `authClient.resetPassword({ newPassword, token })` sends the token in the body, as the library types allow, so no path token is needed.
- The capture is wired through a small service, `PasswordResets` (`passwordResets` in `AppServices`), built in `server.ts` after `createAuth`; `seed.ts` passes its own capture to `createAuth`. Both files are wiring only.
- The reset page is not wrapped in `RedirectIfSession`: the token is the credential, so it works with or without a session. The done notice is a toast shown on arrival at Sign in.
- The Reset password action is on every row, including the signed-in admin's own row; only the role toggle stays hidden there.
- The dialog states the one-hour expiry in its description, as the invite dialog does for seven days; it shows no separate expiry field.
- The E2E resets a freshly invited user, not Bruno, so the shared demo accounts keep their password for the other specs.
- Security review follow-up: `emailAndPassword.onPasswordReset` deletes the user's OAuth access tokens, refresh tokens and consents (`revokeOAuthGrantsOf`) and calls `runtime.closeConnectionsOfUser(userId)`, which closes the user's sockets in every room with the access-revoked code. `createAuth` receives that callback from `server.ts`, because the runtime is built after auth. Agent sessions already open inside the server are not closed.
