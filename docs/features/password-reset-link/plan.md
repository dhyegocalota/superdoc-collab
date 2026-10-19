# Plan: Password reset link from the admin

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/server/src/auth/auth.ts` (`sendResetPassword`), `admin-routes.ts`, `users-table.tsx`, a new public page

## Steps

- [x] **Step 1 (red):** server tests: capture store/take/throw; route 201 with the URL and 404; the public request path answers 404; commit red alone. (4acc1d40)
- [x] **Step 2 (green):** `password-reset-links.ts`, `auth.ts` wiring, constants and path helper in `libs/types`, the route. (3dc785a4; constants landed in 4acc1d40)
- [x] **Step 3 (red):** web tests: users table action, dialog, reset page states; commit red alone. (06e85551)
- [x] **Step 4 (green):** `createPasswordReset`, the dialog, `reset-password-page.tsx`, the route in `router.tsx`. (20ffef69)
- [x] **Step 5:** E2E `e2e/password-reset.spec.ts`; run that file alone; tester briefing; `.claude/rules/` fact about the capture. (4ce90a03)

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | better-auth refuses `requestPasswordReset` without a verified email or with `disabledPaths` | the route test gets 4xx from `auth.api` | call `auth.api` directly (bypasses `disabledPaths`); set `requireEmailVerification: false` explicitly |
| 4 | `authClient.resetPassword` needs the token in the URL path, not a query | the E2E lands on the invalid message | pass `token` in the body as the client types require |
