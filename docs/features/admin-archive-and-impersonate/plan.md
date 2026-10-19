# Plan: Admin archives a user and impersonates a user

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/server/src/admin/` and `apps/web/src/features/admin/`; the banner in `apps/web/src/app/`

## Steps

- [ ] **Step 1:** ADR 0046, spec and index to Building, this plan and the test plan.
- [ ] **Step 2:** types: `ACCOUNT_ARCHIVED_MESSAGE`, `ARCHIVED_REASON`, the self and archived refusal messages, `IMPERSONATION_SESSION_MS`, `isArchived` on `AdminUser`, `impersonatedBy` on `SessionUser`.
- [ ] **Step 3:** red then green, server archive and restore (ban, grants, sockets, 409, 400, 403, archived sign-in, share-link accept).
- [ ] **Step 4:** red then green, server impersonate and stop (cookie with `impersonatedBy`, 400 self, archived and admin, one log line, stop returns the admin).
- [ ] **Step 5:** red then green, web users table (Archive, Restore, Impersonate, Archived chip, confirm dialog).
- [ ] **Step 6:** red then green, `ImpersonationBanner` in the app shell on every route with a session, Stop returns to Admin, the account menu shows the impersonated user.
- [ ] **Step 7:** E2E `e2e/admin-archive-impersonate.spec.ts`, the archiving rule bullet, screenshots, tester briefing, `pnpm typecheck`.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | Ban leaves a socket or grant alive | the sockets spy or the grant rows test fails | revert the archive route commit |
| 4 | The plugin's `Set-Cookie` is not forwarded | the session cookie of the response lacks `impersonatedBy` on `/api/me` | revert the impersonate route commit |
| 4 | Letting `stop-impersonating` through the 404 gate exposes a sibling path | `auth-admin-endpoints.test.ts` still 404s every other plugin path | restore the single 404 rule |
| 6 | The shell wrapper changes how routes mount | `router.test.tsx` redirect and print tests fail | revert the shell commit |

**Steps with no backout:** none.
