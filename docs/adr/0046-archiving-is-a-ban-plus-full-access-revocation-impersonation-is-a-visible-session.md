# 0046. Archiving is better-auth's ban plus a full access revocation; impersonation is better-auth's impersonation session with a visible banner and an audit line

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0020](0020-invite-only-accounts-with-a-first-claim-admin.md) (the plugin's `/admin/*` endpoints answer 404 so no second account path exists), the password reset work (`closeConnectionsOfUser`, `revokeOAuthGrantsOf`), better-auth 1.7.10 admin plugin source

## Context

An admin can neither take a person out of the instance without deleting them nor see the product as that person sees it. Deleting loses documents and history. ADR 0020 hides every plugin admin endpoint at the Hono layer, so the plugin's ban and impersonation endpoints are unreachable from the browser, and a ban alone leaves open sockets and OAuth grants alive.

## Decision

- **Archive** is the plugin's `banUser` (reason `ARCHIVED_REASON`, no expiry) called server-side from `POST /api/admin/users/:id/archive`. The ban deletes the user's sessions; the route then deletes their OAuth grants (`revokeOAuthGrantsOf`) and closes their collaboration and version sockets (`closeConnectionsOfUser`). `POST .../restore` calls `unbanUser`. Member rows, documents, history and invites are untouched. The plugin's `bannedUserMessage` is `ACCOUNT_ARCHIVED_MESSAGE`, so a sign-in answers 403 with it and the sign-in page already shows a 403 message. Accepting a share link as an archived user answers the same message and writes no grant.
- **Guards** are ours: the last active admin cannot be archived (409), nobody archives themself (400). Archived and admin accounts cannot be impersonated (400), because the plugin refuses admin targets unless `allowImpersonatingAdmins` is set, and it stays unset.
- **Impersonate** is the plugin's `impersonateUser` called server-side from `POST /api/admin/users/:id/impersonate` with `impersonationSessionDuration` set to `IMPERSONATION_SESSION_MS`. The route forwards the plugin's `Set-Cookie` headers, writes one log line with ids only (`impersonation started by <adminId> as <userId>`) and answers 204. The session carries `impersonatedBy`, which `/api/me` exposes so the web draws the banner.
- **Stop** is the plugin's own `/api/auth/admin/stop-impersonating`, the one plugin admin path let through the 404 gate: it needs the impersonation session and the signed `admin_session` cookie that only the impersonate route could have set, and it cannot be called as an admin because it is not under `/api/admin`.
- Impersonated actions are the user's own: edits attribute to them. The banner says so.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Delete the user | one step | loses documents and history | the owner wants restorable removal |
| Ban only | no new code | sockets and OAuth grants stay alive until they expire | "signs them out automatically" must be immediate |
| Open every plugin admin path | the client plugin works as documented | re-opens user creation and role changes ADR 0020 closed | one path is enough |
| Own impersonation cookie | no plugin coupling | a second session mechanism to audit | the plugin already stores `impersonatedBy` and restores the admin session |
| Allow impersonating admins | complete | one admin acts as another with the other's authority | not asked for |

## Consequences

- `AdminUser` and `SessionUser` gain the archived flag and `impersonatedBy` respectively.
- An impersonation session lasts one hour; after it the next request answers 401 and the app shows Sign in. The admin's own session is untouched.
- Archiving the only active admin is refused; an archived admin still counts in the role toggle's last-admin rule (known gap, recorded in the tester briefing).

## Evidence

- `docs/features/admin-archive-and-impersonate/test-plan.md` after the build.

## Revisit when

- Organisations arrive: archive and impersonate become per-organisation.
- Audit needs more than a log line: store impersonation starts in a table.
