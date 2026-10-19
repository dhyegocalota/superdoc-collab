# Test plan: Password reset link from the admin

## The failing test first

- [ ] `admin-routes.test.ts::admin creates a password reset link for a user` — expected: 201 with a URL on the app origin containing the token query and `expiresAt` one hour ahead
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] `password-reset-links.test.ts`: store then take returns the token and clears it; take without store throws
- [ ] `admin-routes.test.ts`: unknown user 404; a non-admin gets the existing guard's answer
- [ ] auth: `POST /api/auth/request-password-reset` answers 404
- [ ] web: users table shows `Reset password`; the dialog shows the link and copies it; the reset page shows the form with a token, the invalid message without one, and the done notice after success

## E2E

- [ ] `e2e/password-reset.spec.ts::the admin resets a user's password with a one-time link` — admin creates the link for Bruno; Bruno (new context) opens it, sets a password, signs in with it; the old password fails; the link opened again shows the invalid message

## Prove it for real — Playwright MCP

- [ ] The flow above in two browsers; 375 px layout of the reset page; console and network clean

## Adversarial review

- [ ] Claim 1: a non-admin cannot mint a link — attack: call the route as Bruno; result:
- [ ] Claim 2: the public request path is disabled — attack: POST to it signed out and signed in; result:
- [ ] Claim 3: other sessions of the user are revoked after the reset — attack: keep Bruno signed in elsewhere and reset; result:

## Coverage honesty

- Clock skew on token expiry is not exercised.
