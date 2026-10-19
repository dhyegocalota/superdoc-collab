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

- [ ] Desktop 1280 and mobile 375 of Admin → Users, the confirm dialog and the banner — FAILED in part: Admin Users, the confirm dialog and the banner render at both widths with no sideways page scroll and no page scroll under the banner in the editor (document height 800 of 800 at 1280, 812 of 812 at 375, Edits bar visible); but right after Impersonate the previous admin page fires /api/admin/users and /api/admin/invites as Caio, gets 403 and shows an "Admins only" toast over Caio's documents; .pr-media/testing2/admin-users-1280.png, .pr-media/testing2/admin-users-375.png, .pr-media/testing2/admin-archive-confirm-dialog-1280.png, .pr-media/testing2/admin-archive-confirm-dialog-375.png, .pr-media/testing2/admin-impersonate-caio-documents-1280.png (toast visible bottom right), .pr-media/testing2/admin-impersonate-caio-documents-375.png, .pr-media/testing2/admin-impersonate-caio-editor-1280.png, .pr-media/testing2/admin-impersonate-caio-editor-375.png, .pr-media/testing2/admin-impersonate-account-menu-375.png

## Edge cases

- [x] Impersonation session older than one hour — expected: the next request is 401 and the app shows Sign in — evidence: the impersonated session row lasts exactly 3 600 000 ms (created 1792423942557, expires 1792427542557, impersonated_by the admin); after setting expires_at into the past in the throwaway stack database, a fetch of /api/me still answered 200 (cached session cookie) and the next page load went to /sign-in?next=%2Fdocuments; .pr-media/testing2/admin-impersonation-expired-1280.png
- [x] Archive a user who is mid-edit in two documents — expected: both sockets close with the access-revoked code — evidence: Dani typed in two documents (two tabs of one browser, one author); after Archive both tabs show "Editing is paused: the connection failed. Your session ended. Sign in again."; the socket close code itself was not read; .pr-media/testing2/admin-archive-two-documents-tab1-1280.png

## Tester run walk results (2026-10-19)

- [x] Admin archives Bruno while Bruno has a document open — evidence: confirm dialog "Archive Bruno?" names the person, Cancel sent no request and left Bruno active, Archive showed the Archived chip with Restore and no Impersonate; Bruno's editor showed "Editing is paused: the connection failed. Your session ended. Sign in again. Unsynced edits are lost on sign-in." and his next sign-in showed "This account is archived. Ask an admin to restore it."; .pr-media/testing2/admin-archive-confirm-dialog-1280.png, .pr-media/testing2/admin-archive-bruno-archived-1280.png, .pr-media/testing2/admin-archive-bruno-editor-after-archive-1280.png, .pr-media/testing2/admin-archive-bruno-sign-in-archived-1280.png
- [x] Admin restores Bruno and he signs in again — evidence: Restore removed the chip; Bruno's Sign in returned him to his document with "Bruno before archive" intact; .pr-media/testing2/admin-archive-bruno-restored-1280.png, .pr-media/testing2/admin-archive-bruno-signed-in-again-1280.png
- [x] Admin impersonates Caio — evidence: banner "Viewing as Caio. What you do here counts as theirs. Stop impersonating" on documents and in the editor; account menu shows Caio and caio@example.com; /api/me returns Caio with impersonatedBy set; the banner survives a full reload; typing in Caio's new document shows "Caio" in the Edits bar; Stop impersonating returns to /admin and /api/me is Admin with no banner; .pr-media/testing2/admin-impersonate-caio-editor-1280.png, .pr-media/testing2/admin-impersonate-stopped-1280.png
- [x] Impersonate hidden on admin rows, Archive hidden on the signed-in admin's row — evidence: with Dani made admin her row shows Make user, Reset password, Archive and no Impersonate; the signed-in Admin row shows only Reset password; Dani was set back to user; .pr-media/testing2/admin-second-admin-rows-1280.png
- [x] Briefing hypothesis 5, edits attribute to the impersonated user — evidence: the Edits bar and the presence avatar read Caio while the admin typed

## Edge cases found during execution (tester run 2026-10-19)

- [ ] Impersonate from the Admin page, then look at the first page — FAILED: the Admin page's queries fire after the session switched, /api/admin/users and /api/admin/invites answer 403 (two console errors) and an "Admins only" toast shows on Caio's documents; the briefing's hypothesis 3 (no admin state on screen) is refuted for about a second; .pr-media/testing2/admin-impersonate-caio-documents-1280.png
- [x] Test-plan precondition — the demo administrator is admin@example.com (Admin), not Ana; Ana is a plain user, /admin redirects her to /documents
- [x] 375 px Admin Users table — evidence: the page never scrolls sideways; the table scrolls inside its wrapper and the Actions column is reached by that inner scroll; .pr-media/testing2/admin-users-375.png
- [ ] Archiving an MCP client's connection and the version viewer (briefing hypothesis 1) — BLOCKED: no MCP client is available in the walk; the version viewer was not opened
