# Admin archives a user and impersonates a user

**Status:** Shipped 2026-10-19
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "also add for the admin: archive a user (signing them out automatically), and impersonate a user")
**ADRs:** [0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md); write ADR 0046 "archiving is better-auth's ban plus a full access revocation; impersonation is better-auth's impersonation session with a visible banner and an audit line"
**Not changing:** roles and promotion, invites, the password reset link, the member rows of archived users (their documents and history stay)

## Problem

An admin cannot take someone out of the instance without deleting them, and cannot see the product as a user sees it to help them.

## Design (recommended)

- **Archive.** Admin → Users gets `Archive` on every row but the admin's own and the last admin; a confirm dialog names the person. The route `POST /api/admin/users/:id/archive` calls better-auth's admin `banUser` (reason `ARCHIVED_REASON`, no expiry), revokes the user's sessions (`revokeUserSessions`), closes their collaboration and version sockets (`runtime.closeConnectionsOfUser`, from the reset work) and revokes their OAuth grants (`revokeOAuthGrantsOf`), and answers the updated user. The users list shows `Archived` as a state chip and offers `Restore` (`POST .../restore` → `unbanUser`). An archived person who signs in sees `ACCOUNT_ARCHIVED_MESSAGE` (better-auth's banned error mapped in `auth-failure.ts`); their member rows stay, they appear offline, their invites are untouched. Archiving the last admin is refused with `LAST_ADMIN_MESSAGE` (existing).
- **Impersonate.** `Impersonate` on every non-archived row but the admin's own; the route `POST /api/admin/users/:id/impersonate` calls better-auth's `impersonateUser` (the plugin's `impersonationSessionDuration` set to `IMPERSONATION_SESSION_MS`, 1 hour), logs one line `impersonation started by <adminId> as <userId>` (ids only), and the web navigates to the documents home as that user. While `session.impersonatedBy` is set, every page shows an `ImpersonationBanner` under the top bar (`role="status"`, full width, the banner conventions of web-ui.md): "Viewing as <name>" and a `Stop impersonating` button that calls `stopImpersonating` and returns to Admin. Impersonated actions are the user's own (edits attribute to them), which the banner states in one sentence. The account menu while impersonating shows the user, not the admin.
- Copy in `admin-copy.ts` and a new `impersonation-copy.ts`; the banner lives in the app shell so it shows on every route with a session.

### Failure handling

| Case | Behaviour |
|------|-----------|
| Archive the last admin or yourself | 409 `LAST_ADMIN_MESSAGE` / 400 `CANNOT_ARCHIVE_SELF_MESSAGE`; buttons hidden anyway |
| Impersonate an archived user or yourself | 400 with the message; button hidden |
| Impersonation session expires | the next request answers 401, the app shows Sign in as today |
| Archived user holds a share link | accepting it answers the archived message, no grant |

## Test strategy summary

Server: archive route (ban, sessions revoked, sockets closed, grants revoked, 409 last admin, 400 self, non-admin refused), restore, sign-in of an archived user refused with the message, share-link accept refused; impersonate route (session with `impersonatedBy`, 400 self and archived, log line with ids only), stop. Web: users table actions and chips, confirm dialog, banner on every route while impersonating, Stop returns to Admin, account menu shows the impersonated user. E2E: admin archives Bruno (Bruno's open editor loses the socket and his next page shows the archived message on sign-in), restores him; admin impersonates Caio, sees his documents with the banner, stops and is back as admin.
