# Test plan: Admin archives a user and impersonates a user

## Unit (server)

- [ ] Archive as admin — expected: 200, the user is archived, their sessions are gone, `closeConnectionsOfUser` called with the id, their OAuth grants deleted and another user's kept
- [ ] Archive the last active admin — expected: 409 `LAST_ADMIN_MESSAGE`
- [ ] Archive yourself with a second admin present — expected: 400 `CANNOT_ARCHIVE_SELF_MESSAGE`
- [ ] Archive an unknown id — expected: 404
- [ ] Archive and restore as a non-admin or signed out — expected: 403 and 401
- [ ] Restore — expected: 200, the user signs in again
- [ ] Sign in as an archived user — expected: 403 with `ACCOUNT_ARCHIVED_MESSAGE`
- [ ] Accept a share link as an archived user — expected: 403 with `ACCOUNT_ARCHIVED_MESSAGE`, no member row
- [ ] Impersonate — expected: 204, the cookie reads `/api/me` as the target with `impersonatedBy` set to the admin, one log line with ids only
- [ ] Impersonate yourself, an archived user, an admin — expected: 400 each
- [ ] Stop impersonating through `/api/auth/admin/stop-impersonating` — expected: `/api/me` is the admin again; every other plugin admin path stays 404

## Unit (web)

- [ ] Users table — expected: Archive and Impersonate on other users' rows, none on the signed-in admin's row, Archived chip with Restore on an archived row and no Impersonate
- [ ] Archive confirm dialog names the person and Cancel does nothing — expected: no request until Archive is confirmed
- [ ] Banner while `impersonatedBy` is set — expected: `role="status"` with the name, the sentence and Stop impersonating; absent otherwise
- [ ] Stop impersonating — expected: the session query is invalidated and the app navigates to Admin
- [ ] Account menu while impersonating — expected: shows the impersonated user
- [ ] Sign-in with the archived message — expected: the page shows `ACCOUNT_ARCHIVED_MESSAGE`

## E2E

- [ ] Admin archives Bruno — expected: Bruno's open editor loses its socket and his next sign-in shows the archived message
- [ ] Admin restores Bruno — expected: Bruno signs in again
- [ ] Admin impersonates Caio — expected: Caio's documents with the banner; Stop returns to Admin as the admin

## Playwright MCP walk

- [ ] Desktop 1280 and mobile 375 of Admin → Users, the confirm dialog and the banner

## Edge cases

- [ ] Impersonation session older than one hour — expected: the next request is 401 and the app shows Sign in
- [ ] Archive a user who is mid-edit in two documents — expected: both sockets close with the access-revoked code
