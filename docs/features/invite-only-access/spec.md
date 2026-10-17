# Invite-only access — spec

- Status: Approved
- Tier: red (authentication surface: who can create an account, a new role, a new table, a new admin page).
- Owner approval: design approved in chat 2026-10-17 (four questions answered: first sign-up claims the instance; single-use invite links; admin-only invites on `/admin`; demo seed out of production, kept for E2E and agentic tests). Spec: approved 2026-10-17 ("continua").
- ADRs: [0020](../../adr/0020-invite-only-accounts-with-a-first-claim-admin.md); amends [0005](../../adr/0005-authentication-with-better-auth.md) (open sign-up, seeded demo users). [0010](../../adr/0010-documents-ownership-and-share-links.md) is unchanged: admins have no power over documents they do not own.
- Not changing: document ownership and share links, sessions, the Hocuspocus handshake, the LLM pipeline, the demo seed's content (Ana, Bruno, Caio, Dani stay as test users).

## Problem

Sign-up is open. Anyone who finds the URL creates an account, uploads documents and spends the instance's LLM budget. There is no notion of an administrator, no way to decide who may join, and the production runbook seeds four demo accounts with one shared password. The README assumes the reader is the evaluator of a take-home, not someone installing the app.

## Goals

- A fresh instance is **unclaimed**. The first account created claims it and becomes the only admin; from then on sign-up needs a valid invite.
- An **admin** generates single-use invite links, sees who holds an account, revokes pending invites and promotes or demotes admins.
- An **invitee** opens the link, enters name, email and password, and lands on their documents like any user.
- Production deploys seed nothing. The demo users exist only where tests need them.
- The README reads for a newcomer and carries a prompt an agent can execute to install the app end to end, ending with the human claiming the instance.
- Every new account stores the time zone its browser reported at sign-up (`user.timeZone`, IANA name), so the zone is never unknown for accounts created from now on; an account created before this slice gets its browser zone written once at its next sign-in. The preferences page, the visible zone indicator and the zone-aligned bins are `docs/features/timezone-preference/` (owner ruling of 2026-10-17: capture at sign-up lives here because the form and the migration are being changed anyway).

## Non-goals

- E-mail delivery, password reset, e-mail verification (the "No email" limit stays).
- Admin powers over documents: an admin is a normal user with user management.
- Organisations, groups, per-document admin, SSO.
- Reusable or multi-use invite links.
- Removing an account (Better Auth's `removeUser` exists; the page does not expose it in this slice).

## Design

### Roles and the claim

- `user.role` comes from Better Auth's `admin` plugin: `UserRole.Admin = 'admin'`, `UserRole.User = 'user'`, enum in `libs/types`. The plugin also adds `banned`, `banReason`, `banExpires` to `user` and `impersonatedBy` to `session`; the schema is regenerated with the Better Auth CLI and migrated with Drizzle, as the existing schema was.
- The instance is **claimed** when the `user` table has at least one row. `GET /api/setup` is public and answers `{ claimed: boolean }`; nothing else about the instance is disclosed.
- Sign-up keeps Better Auth's `/sign-up/email`. The existing `hooks.before` gains a gate for that path, evaluated after input normalisation:
  - unclaimed → allowed; the request is marked as a **claim**;
  - claimed and the body carries `inviteToken` that resolves to a pending, unexpired, unrevoked invite → allowed; the request is marked with the invite id;
  - otherwise → `APIError('FORBIDDEN', { message: SIGN_UP_BY_INVITATION_MESSAGE })`.
- The `hooks.after` for the same path: on a claim, sets `role = admin` on the created user; on an invite, stamps `acceptedBy` and `acceptedAt`. Both run in the same SQLite connection as the user insert; a failure here throws and the response is 500 with the user row left in place, which the test plan covers (an admin can still promote by hand; see Failure handling).
- Two claims racing: the gate reads the user count, both pass, both insert. The after hook sets `admin` only when the created user is the **earliest** row by `createdAt` then `id`; the other becomes a plain user. Pinned by a unit test with two concurrent sign-ups.

### Time zone at sign-up

- `user.timeZone` is a nullable text column added by the same migration; Better Auth exposes it as an additional field (`user.additionalFields.timeZone`, `type: 'string'`, `required: true`, `input: true`), so `/sign-up/email` requires it and `/update-user` accepts it.
- The sign-up page sends `Intl.DateTimeFormat().resolvedOptions().timeZone`; the server rejects a value outside `Intl.supportedValuesOf('timeZone')` with 400 `INVALID_TIME_ZONE_MESSAGE`; `signUpSchema` gains `timeZone` with that refinement, applied by the existing input-normalisation hook.
- `SessionUser` carries `timeZone: string | null`. The sign-in page, after a successful sign-in whose session user has `timeZone === null`, calls `authClient.updateUser({ timeZone })` once with the browser zone and refetches the session. The seed passes `UTC`.
- Nothing in this slice reads the stored zone for display: the audit found the client already formats in the browser zone, and the preference feature switches the formatter to the stored one.

### Invites

- Table `invites` in `auth.sqlite`: `id` (random), `tokenHash` (sha256 of the token, unique), `createdBy` (user id), `createdAt`, `expiresAt` (`createdAt + INVITE_TTL_MS`, 7 days), `acceptedBy` (user id, nullable), `acceptedAt` (nullable), `revokedAt` (nullable).
- Token: `INVITE_TOKEN_BYTES = 32` random bytes, base64url, returned once by the create endpoint inside the full URL `${APP_ORIGIN}/sign-up?invite=<token>`; never stored.
- The token travels to the server in the `x-invite-token` request header (`INVITE_TOKEN_HEADER` in `libs/types`), set by the sign-up page through the Better Auth client's per-call `fetchOptions`; `signUpSchema` is unchanged. Ruled during planning: the client types the body strictly and the header keeps one sign-up path.
- Times: `expiresAt`, `createdAt` and `acceptedAt` are epoch milliseconds in the database and in the API; the admin page renders them with the shared `formatTimestamp` in the reader's own time zone, never a server zone (owner requirement of 2026-10-17: time zones must work carefully everywhere; the cross-cutting audit lives in `docs/features/timezone-preference/`).
- State is derived, never stored: `pending` (no acceptedAt, no revokedAt, not expired), `accepted`, `revoked`, `expired`. `InviteState` enum in `libs/types`.
- `InvitesRepository` (`apps/server/src/admin/invites.ts`): `create({ createdBy })`, `list()`, `revoke(id)`, `resolve(token)` (pending only, else `null`), `accept({ id, userId })`. Hashing is a sibling of `hashShareToken`, moved to a shared `token-hash.ts` so both use it.

### Routes

Admin routes answer 401 signed out and 403 for a non-admin; `requireAdmin` middleware next to the existing session middleware.

| Method and path | Who | Body / answer |
|---|---|---|
| `GET /api/setup` | public | `{ claimed }` |
| `GET /api/invites/:token` | public | `200 { state: 'pending' }` only while the invite is pending; unknown, accepted, revoked and expired tokens all answer 404 with no detail, so the page shows one "This invite is not valid" for every dead link |
| `GET /api/admin/users` | admin | `[{ id, name, email, role, createdAt }]` |
| `POST /api/admin/users/:id/role` | admin | `{ role }`; the last admin cannot be demoted (409 `LAST_ADMIN_MESSAGE`), so an instance never ends up without an admin; an admin may step down only when another admin exists |
| `GET /api/admin/invites` | admin | `[{ id, state, createdAt, expiresAt, createdBy: { name }, acceptedBy: { name } \| null }]` |
| `POST /api/admin/invites` | admin | `201 { id, url, expiresAt }` |
| `DELETE /api/admin/invites/:id` | admin | `204`; revoking an accepted invite is a 409 |

`ApiPath` gains `Setup = '/api/setup'`, `Invites = '/api/invites'`, `Admin = '/api/admin'`; `AppRoute` gains `Admin = '/admin'`. `signUpSchema` is unchanged; the gate reads the `x-invite-token` header and decides whether it is required.

### Web

- `/sign-in`: a "Claim this instance" link replaces "Create account" while `GET /api/setup` says unclaimed; when claimed there is no sign-up link at all.
- `/sign-up`: reads `?invite=`. Unclaimed and no token: heading "Claim this instance", copy "The first account becomes the administrator." Claimed with a token: `GET /api/invites/:token` first; `pending` shows the form with the heading "You were invited"; anything else shows "This invite is not valid. Ask an admin for a new link." Claimed without a token: the same message. A 403 from the server (race or a token that died between the check and the submit) shows the server's message on the form.
- `/admin`: route guarded by `requireSession` plus `role === admin`; non-admins see the documents page with a toast "Admins only". Sections: **Users** (name, email, role, joined; a role toggle per row except the signed-in admin's own) and **Invites** (state, created, expires, created by, accepted by; "Generate invite" creates one and copies the URL to the clipboard with a toast "Invite link copied"; "Revoke" on pending rows). The header shows an "Admin" link for admins.
- `useSession` exposes `role`; `SessionUser` gains `role`.

### Seeds and environment

- `SEED_DEMO_USERS` and `DEMO_PASSWORD` leave `deploy/docker-compose.yml`, the Railway runbook and the README's configuration table. The entrypoint still requires `SEED_DEMO_USERS` to be `true` or `false`; the install prompt and the runbook pass `false`.
- The seed creates the four demo users with `role = user` and one test-only admin, `admin@example.com`, with `role = admin`, all with `DEMO_PASSWORD`. A seeded stack is therefore claimed and has an admin, which is what the E2E suite and agentic tests need. Production never runs the seed.
- Documentation of `DEMO_PASSWORD` moves to the Tests section.

### Install story and README

The README is rewritten for a newcomer, in this order: one-paragraph pitch, three screenshots, **Quick start** (Docker Compose in three commands, then "open the URL and claim the instance"), **Install on Railway** (points at the runbook), **Install with an agent** (a fenced prompt to paste into Claude Code or Codex: clone, pick Railway or Docker, generate `AUTH_SECRET`, set the variables, deploy, verify `/api/health`, print the URL and stop so the human claims the instance, then explain `/admin` and invites), **First login**, **Invite your team**, **Configuration** (a table of every variable with default and purpose), **How it works** (features, shortened), **Architecture**, **Tests**, **Limits**, **Credits**, **License**. The Try-it walkthrough stays, rewritten for the invited user. The Railway runbook drops the seed steps and gains "Claim the instance" after "Check it".

### Failure handling

| Failure | Behaviour |
|---|---|
| Sign-up when claimed, no or bad token | 403 with `SIGN_UP_BY_INVITATION_MESSAGE`; nothing written |
| Token valid at page load, consumed or revoked before submit | 403 from the gate; the form shows the message, nothing written |
| After hook fails on a claim | the user exists as `user`; the instance is claimed with no admin. Recovery: `pnpm admin:promote <email>` script in `apps/server` (one file, uses the repository), documented under Limits |
| Two concurrent claims | one admin, one user (earliest row wins) |
| The last admin is demoted (by themselves or by nobody else, since they are the last) | 409, role unchanged |
| Revoke an accepted invite | 409 |
| Expired invite opened | "This invite is not valid" |
| Admin page opened by a user | redirect to documents with a toast |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|---|---|---|---|
| First admin | env vars at boot; first sign-up claims; CLI | first sign-up claims | 2026-10-17 |
| Invite mechanism | single-use link; admin sets a password; reusable link | single-use link, 7 days | 2026-10-17 |
| Who invites | admin on `/admin`; admin by API only; everyone | admin on `/admin` | 2026-10-17 |
| Demo seed | keep as plain users; remove | out of production; tests only | 2026-10-17 |
| Server approach | admin plugin + sign-up hook; disable sign-up + own endpoint | admin plugin + hook | 2026-10-17 |

## Test strategy summary

- Unit, server: `invites.test.ts` (token never stored, hash lookup, pending/accepted/revoked/expired derivation, single use); `auth-gate.test.ts` (unclaimed claim becomes admin; claimed without token 403; valid token accepted and consumed; expired/revoked/used 403; two concurrent claims yield one admin); `admin-routes.test.ts` (401/403 matrix, self-demotion 409, revoke accepted 409, create returns a URL that resolves once); `setup-route.test.ts`.
- Unit, web: sign-in link presence by setup state; sign-up page states (claim, invited, invalid, forbidden on submit); admin page (list, generate copies URL, revoke, role toggle hidden on self).
- E2E (`auth.spec.ts` rewritten, `admin.spec.ts` new): claim → `/admin` → generate → second context accepts → both open the same shared document; sign-up without a link is refused; the invite cannot be used twice.
- Playwright MCP walk on the deployed instance: the runbook's "Claim the instance" and "Invite your team" boxes.
- Repository-shape: the README configuration table lists every variable the compose file reads; the install prompt names every required variable.
