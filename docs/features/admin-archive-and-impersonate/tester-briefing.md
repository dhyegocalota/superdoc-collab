# Tester briefing: Admin archives a user and impersonates a user

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `libs/types/src/account-access.ts`, `routes.ts`, `auth.ts` — messages, `UserAction`, `userActionApiPath`, `STOP_IMPERSONATING_API_PATH`, `AdminUser.isArchived`, optional `SessionUser.impersonatedBy`
- `apps/server/src/admin/user-access.ts`, `user-access-routes.ts` — archive, restore and impersonate through better-auth's admin API called server-side
- `apps/server/src/http/app.ts` — `stop-impersonating` is let through the plugin 404 gate; everything else under `/api/auth/admin/*` stays 404
- `apps/server/src/auth/auth.ts`, `session.ts` — `bannedUserMessage`, one-hour impersonation session, `/api/me` carries `impersonatedBy`
- `apps/server/src/documents/share-links-routes.ts` — an archived user's accept answers 403 with the archived message
- `apps/web/src/features/admin/users-table.tsx`, `user-access-buttons.tsx` — Archive (confirm dialog), Restore, Impersonate, Archived chip
- `apps/web/src/features/impersonation/`, `apps/web/src/app/app-shell.tsx`, `router.tsx` — the banner in a shell route that wraps every route
- `.claude/rules/collaboration.md`, ADR 0046, learning on the bodyless better-auth POST

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/admin/user-access-routes.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/impersonation/impersonation-banner.test.tsx
pnpm exec playwright test e2e/admin-archive-impersonate.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `user-access-routes.test.ts` (10 of 15 red) | `expected 404 to be 200` and similar: the routes did not exist; `expected false to be true` for the archived flag | `f838642a` |
| `share-links-routes.test.ts::an archived user accepting a link…` | `expected [ 200, … ] to deeply equal [ 403, … ]` | `f838642a` |
| `admin-page.test.tsx` (5 red) | `Unable to find an accessible element with the role "button" and name "Archive"`, `…the text: Archived` | `69704600`, `adda2f76` |
| `impersonation-banner.test.tsx` (4 red), `router.test.tsx::…while impersonating` (1 red) | the stub threw `ImpersonationBanner is not implemented`, the tests timed out at 5 s | `adda2f76` |
| `impersonation-banner.test.tsx::Stop impersonating posts…` | `expected "fetch" to be called with arguments` (no JSON content type) | `13c7896b` |

Pins, green when they landed: 401 and 403 for the three actions, 404 for an unknown id, the archived sign-in message on the sign-in page, an active row without a chip, the account menu showing the impersonated user, the server 415 on a bodyless stop.

The commit `69704600` is not self-contained: it missed the shell files, which `adda2f76` adds. Check out `adda2f76` for the green run.

## Hypotheses to attack

1. Hypothesis: archiving ends every way the user reaches the instance. Break it by: archive a user with an open editor, an open version viewer and a connected MCP client, then try each again.
2. Hypothesis: only `stop-impersonating` passes the plugin gate. Break it by: call every other `/api/auth/admin/*` path while impersonating and as admin.
3. Hypothesis: impersonating leaves no admin state on screen. Break it by: impersonate from a page with cached admin data and look for admin documents under the impersonated name.
4. Hypothesis: the banner never hides the page. Break it by: impersonate and open an editor at 1280 and 375 (the banner adds its height above pages that already fill the screen).
5. Hypothesis: edits made while impersonating attribute to the impersonated user. Break it by: type as the impersonated user and read the timeline author.

## Known gaps

- Deviation from the spec: the better-auth `banUser` already deletes the user's sessions, so `revokeUserSessions` is not called.
- Deviation from the spec: Impersonate is also hidden for admin rows, because the plugin refuses admin targets (`allowImpersonatingAdmins` stays unset); the route answers 400 with its own message.
- Deviation from the spec: the banner sits above each page's own top bar, because every page draws its own top bar and there is no shared one.
- The 409 for the last admin is reachable only when the sole active admin archives themself; with two admins that case is a 400.
- A page that fills the viewport with a fixed height (the editor) scrolls by the banner's height while impersonating; the editor is another lane's file and was not touched.
- Not run: the Playwright MCP walk, the one-hour expiry edge case, the version viewer and MCP client after archiving.

## Tester run 2026-10-19

Walk on the scenario stack at 1280 and 375, one browser per person. The seeded administrator is admin@example.com, not Ana.

- Confirmed: archive with a confirm dialog that names the person, Cancel sends nothing; Bruno's open editor loses its connection and his next sign-in shows the archived message; Restore lets him in with his text intact; two documents open for one archived user both lose the connection; Impersonate shows the banner on documents and in the editor with no page scroll at 1280 and 375; the account menu shows the impersonated user; Stop impersonating returns to Admin; Impersonate is hidden on admin rows and Archive on the signed-in admin's row; impersonation edits attribute to the impersonated user; the impersonation session lasts exactly one hour and, once expired, the next page load shows Sign in.
- Found (refutes hypothesis 3): right after Impersonate, the admin page requests /api/admin/users and /api/admin/invites as the impersonated user, gets 403 and shows an "Admins only" toast over Caio's documents. Two console errors. Needs a regression test that Impersonate navigates without leaving admin queries running.
- Noted: with the session expired in the database, one /api/me still answered 200 from the cached session cookie before the page load went to Sign in.
- Blocked: archiving with a connected MCP client and the version viewer were not walked.
