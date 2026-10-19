# Test plan: Admin archives a user and impersonates a user

## Unit (server)

- [x] Archive as admin — expected: 200, the user is archived, their sessions are gone, `closeConnectionsOfUser` called with the id, their OAuth grants deleted and another user's kept
- [x] Archive the last active admin — expected: 409 `LAST_ADMIN_MESSAGE`
- [x] Archive yourself with a second admin present — expected: 400 `CANNOT_ARCHIVE_SELF_MESSAGE`
- [x] Archive an unknown id — expected: 404
- [x] Archive and restore as a non-admin or signed out — expected: 403 and 401
- [x] Restore — expected: 200, the user signs in again
- [x] Sign in as an archived user — expected: 403 with `ACCOUNT_ARCHIVED_MESSAGE`
- [x] Accept a share link as an archived user — expected: 403 with `ACCOUNT_ARCHIVED_MESSAGE`, no member row
- [x] Impersonate — expected: 204, the cookie reads `/api/me` as the target with `impersonatedBy` set to the admin, one log line with ids only
- [x] Impersonate yourself, an archived user, an admin — expected: 400 each
- [x] Stop impersonating through `/api/auth/admin/stop-impersonating` — expected: `/api/me` is the admin again; every other plugin admin path stays 404

## Unit (web)

- [x] Users table — expected: Archive and Impersonate on other users' rows, none on the signed-in admin's row, Archived chip with Restore on an archived row and no Impersonate
- [x] Archive confirm dialog names the person and Cancel does nothing — expected: no request until Archive is confirmed
- [x] Banner while `impersonatedBy` is set — expected: `role="status"` with the name, the sentence and Stop impersonating; absent otherwise
- [x] Stop impersonating — expected: the session query is invalidated and the app navigates to Admin
- [x] Account menu while impersonating — expected: shows the impersonated user
- [x] Sign-in with the archived message — expected: the page shows `ACCOUNT_ARCHIVED_MESSAGE`

## E2E

- [x] Admin archives Bruno — expected: Bruno's open editor loses its socket and his next sign-in shows the archived message
- [x] Admin restores Bruno — expected: Bruno signs in again
- [x] Admin impersonates Caio — expected: Caio's documents with the banner; Stop returns to Admin as the admin

## Playwright MCP walk

- [ ] Desktop 1280 and mobile 375 of Admin → Users, the confirm dialog and the banner

## Edge cases

- [ ] Impersonation session older than one hour — expected: the next request is 401 and the app shows Sign in
- [ ] Archive a user who is mid-edit in two documents — expected: both sockets close with the access-revoked code
