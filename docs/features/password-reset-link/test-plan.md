# Test plan: Password reset link from the admin

## The failing test first

- [x] `admin-routes.test.ts::admin creates a password reset link for a user` — expected: 201 with a URL on the app origin containing the token query and `expiresAt` one hour ahead (green, commit 3dc785a4)
- [x] Confirmed it fails for the right reason (red run, commit below): `AssertionError: expected 404 to be 201` for the route test; capture tests `Error: PasswordResetLinkCapture.store is not implemented`; unknown user `expected { error: 'Not found' } to deeply equal { error: 'User not found' }`; public request path `expected 400 to be 404` (better-auth logged "Reset password isn't enabled")

## Unit

- [x] `password-reset-links.test.ts`: store then take returns the token and clears it; take without store throws
- [x] `admin-routes.test.ts`: unknown user 404; a non-admin gets the existing guard's answer
- [x] auth: `POST /api/auth/request-password-reset` answers 404
- [x] web: users table shows `Reset password`; the dialog shows the link and copies it; the reset page shows the form with a token, the invalid message without one, and the done notice after success

## E2E

- [x] `e2e/password-reset.spec.ts::the admin resets a user's password with a one-time link` — admin creates the link for Bruno; Bruno (new context) opens it, sets a password, signs in with it; the old password fails; the link opened again shows the invalid message (green, 1 passed, with a freshly invited user instead of Bruno)

## Prove it for real — Playwright MCP

- [x] The flow above in two browsers; 375 px layout of the reset page; console and network clean — evidence: admin (own browser) Admin, Users, Reset password for Bruno: dialog "Password reset link", read-only link http://127.0.0.1:3200/reset-password?token=<24 chars>, "works once and expires in one hour. It is shown only now.", Copy link, Close (screenshot .pr-media/testing/password-reset-link-dialog-1280.png); Bruno's other browser (signed in) kept open; a signed-out browser opened the link, form "Choose a new password"; at 375 scrollWidth 375 (screenshot .pr-media/testing/password-reset-link-form-375.png); set "brand-new-password" and landed on /sign-in with the toast "Your password was changed. Sign in with the new one." (screenshot password-reset-link-done-1280.png); the old password showed "Invalid email or password."; the new password signed in to /documents; the link opened and submitted again showed "This reset link is not valid or has expired. Ask an admin for a new one." with a Sign in link; console: only expected 4xx of the invalid attempts

## Adversarial review

- [x] Claim 1: a non-admin cannot mint a link — attack: call the route as Bruno; result: — evidence: Bruno POST /api/admin/users/anyid/password-reset: 403 {"error":"Admins only."}; signed out: 401
- [x] Claim 2: the public request path is disabled — attack: POST to it signed out and signed in; result: — evidence: POST /api/auth/request-password-reset signed out: 404; signed in as Bruno: 404 Not Found; POST /api/auth/forget-password signed in: 404
- [x] Claim 3: other sessions of the user are revoked after the reset — attack: keep Bruno signed in elsewhere and reset; result: — evidence: Bruno signed in in a second browser before the reset; after the reset that browser reloaded /documents and was redirected to /sign-in?next=%2Fdocuments

## Coverage honesty

- Clock skew on token expiry is not exercised.

## Red run, web (commit "red web tests")

- `admin-page.test.tsx`: `every user row offers Reset password` and `reset password posts for that user...` fail with `Unable to find an accessible element with the role "button" and name "Reset password"`.
- `reset-password-page.test.tsx`: five tests fail with `Error: ResetPasswordPage is not implemented`.
- `router.test.tsx`: `the reset password route needs no session and keeps its path` times out (5 s) because `/reset-password` falls through to the unknown-path redirect.

## Edge cases found during execution

- /reset-password with no token shows the invalid message with a Sign in link, no form; with a wrong token the form shows first and the invalid message appears only after submit (the page cannot know earlier; one POST /api/auth/reset-password)
- A password of 5 characters shows "Use at least 8 characters." and sends no request
- A signed-in visitor (Bruno) opens /reset-password pages without redirect (hypothesis 7)
- The minted token does not appear in the stack's server log (grep count 0)
- Not exercised: expiry by clock, Copy link clipboard contents
