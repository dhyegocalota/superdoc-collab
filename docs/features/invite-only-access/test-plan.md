# Test plan: Invite-only access

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path). Written before the build from `spec.md` and `plan.md`, revised with the plan reviews of 2026-10-17.

## The failing test first

- [ ] `apps/server/src/auth/sign-up-gate.test.ts::a sign-up without a token on a claimed instance is refused and creates no user` — input: claimed test server, POST sign-up with no header; expected before the build: `expected 200 to be 403`.
- [ ] Confirmed it fails for the right reason: the server accepted the sign-up, not a missing module or a helper error.

## Unit — libs/types

- [ ] `invites.test.ts` — `inviteStateOf`: pending, accepted, revoked, expired; revoked wins over expired; accepted before expiry stays accepted; expiry exactly at `now` is expired; `INVITE_TTL_MS` is seven days.
- [ ] `routes.test.ts` — `inviteApiPath('a b')` → `/api/invites/a%20b`; `signUpPagePath('x/y')` → `/sign-up?invite=x%2Fy`; `adminApiPath` for both resources.
- [ ] `auth.test.ts` — `signUpSchema` accepts `America/Sao_Paulo`, rejects `Mars/Olympus` with `INVALID_TIME_ZONE_MESSAGE`, and rejects a body without `timeZone`.

## Unit — server

- [ ] `auth/token-hash.test.ts` — sha256 hex, 64 characters, deterministic, not equal to the token.
- [ ] `auth/session.test.ts` — an invited user's session carries `role: 'user'` and `timeZone: 'UTC'`; a user row with an empty role makes `readSession` throw `SessionUserWithoutRoleError`, never a silent `'user'`.
- [ ] `admin/invites.test.ts` — create stores only the hash and returns a URL containing the token once; accept is single use; revoke outcomes (revoked, already-accepted, not-found) with the clock advanced between creates so the list is newest first; expiry after seven days and not before; list names creator and acceptor.
- [ ] `auth/sign-up-gate.test.ts` — first sign-up on an unclaimed instance is admin and keeps `America/Sao_Paulo`; a token sent on an unclaimed instance does not spoil the claim; claimed without token → 403 with `SIGN_UP_BY_INVITATION_MESSAGE` and zero rows; pending token admits once, marks the invite accepted by name, and the user is `'user'`; revoked, expired and unknown tokens → 403 and zero rows; an invite that stops being pending after the gate (`accept` mocked to `false`) → 403 and zero rows; one token used by two concurrent sign-ups admits exactly one; ten rounds of two concurrent first sign-ups each leave exactly one admin and one 403; an unknown zone is 400 before the gate and claims nothing; a `role` in the body answers 400 and creates nothing; a valid sign-in is still normalised by the credentials hook.
- [ ] `auth/seed-demo-users.test.ts` — the seed claims with `admin@example.com` first (role admin, zone `UTC`), admits Ana, Bruno, Caio and Dani as users by invite, and a second run creates nothing and no new invites.
- [ ] `admin/setup-routes.test.ts` — `/api/setup` is `{ claimed: false }` on an empty database and `{ claimed: true }` after the first sign-up.
- [ ] `admin/invite-routes.test.ts` — pending → `{ state: 'pending' }`; accepted, revoked, expired and unknown → 404 alike.
- [ ] `admin/admin-routes.test.ts` — five routes × (signed out → 401, user → 403); users listed with roles and `createdAt` numbers; create → 201 with a URL that admits exactly one sign-up (the second answers 403); revoke → 204 / 409 / 404; roles: promote, step down with another admin present (200), last admin → 409 `LAST_ADMIN_MESSAGE`, unknown → 404, bad role → 400; two admins demoting each other at once leave one admin.
- [ ] `http/auth-admin-endpoints.test.ts` — `impersonate-user`, `set-role`, `create-user`, `set-user-password`, `remove-user`, `ban-user`, `list-users` under `/api/auth/admin/` answer 404 to the admin; `/update-user` with `{ role: 'admin' }` answers 400 and the role stays `user`.
- [ ] `admin/promote.test.ts` — promotes an existing email; reports an unknown one; the tsup entry `admin-promote` exists.
- [ ] Every pre-existing server test passes after the listed edits (`app.test.ts`, `server.test.ts`, `seed-demo-users.test.ts`), including the five restart suites — expected: `pnpm --filter @superdoc-history/server test:unit` green, count ≥ 383 plus the new tests.
- [ ] `repository-shape/compose.test.ts`, `delivery-docs.test.ts` — production compose sets `SEED_DEMO_USERS` to `"false"` and never reads `DEMO_PASSWORD`; the README configuration table lists every production compose variable; the agent prompt names `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false` and ends with "claim the instance"; Limits mentions `admin-promote`.

## Unit — web

- [ ] `auth/sign-up-page.test.tsx` — unclaimed → "Claim this instance" heading and the form; the claim form sends the browser's IANA zone; claimed without token → invalid message, no form; pending token → "You were invited"; revoked token → invalid message; submit sends `x-invite-token` and the zone, and a 403 shows the server's sentence.
- [ ] `auth/sign-in-page.test.tsx` — claim link only while unclaimed; no sign-up link once claimed; nothing while setup loads; a session with `timeZone: null` triggers one `updateUser({ timeZone })`, a session with a zone triggers none.
- [ ] `auth/use-auth-submit.test.tsx` — 401 and 429 messages unchanged; 403 passes the server message; `headers` reach the request options; `afterSuccess` runs before navigation.
- [ ] `admin/admin-page.test.tsx` — users with roles, no toggle on self; generate opens the dialog with the URL in a read-only textbox, copies it, shows "Invite link copied", refetches; with the clipboard rejecting, the URL stays visible and `COPY_FAILED_MESSAGE` shows; revoke sends DELETE and refetches, a failed revoke shows `ACTION_FAILED_MESSAGE`; make admin posts and refetches; a pending row reads "Pending" with Revoke, an accepted row reads "Accepted" without; expiry renders through `formatTimestamp`.
- [ ] `admin/require-admin.test.tsx` — user → documents + "Admins only" toast; signed out → sign-in with `next`; admin → children.
- [ ] `documents/documents-page.test.tsx` — Admin link only for admins.

## E2E (Playwright specs)

- [ ] `e2e/auth.spec.ts::sign-up without an invite is refused once the instance is claimed` — open `/sign-up`; expected: the invalid message, no Sign up button.
- [ ] `e2e/admin.spec.ts::an admin invites a user who joins…` — admin opens `/admin`, generates, reads the URL from the dialog; a second context accepts as Eve; expected: Eve on documents without an Admin link; the Invites table's newest row reads Accepted and the Users table lists Eve.
- [ ] `e2e/admin.spec.ts::an invite link cannot be used twice` — expected: a third context sees the invalid message.
- [ ] `e2e/admin.spec.ts::a revoked invite shows the invalid message` — Revoke on the newest row of the Invites table; expected: Revoked, and the link shows the invalid message.
- [ ] `e2e/admin.spec.ts::a user opening /admin is sent to documents with the admins-only toast`.
- [ ] The whole suite: `pnpm test:e2e` green; the admin spec runs serially with every context registered for closing.

## Prove it for real — Playwright MCP

Against a fresh local stack with `SEED_DEMO_USERS=false` (`docker compose up --build` with an empty volume), then against the deployed instance after the merge. Run the walk with the context option `timezoneId: 'America/Sao_Paulo'`.

- [ ] Time zone: after the claim, `GET /api/me` shows `America/Sao_Paulo`; after signing in as a seeded user (local stack only, `UTC`), their zone is unchanged, since only `null` is backfilled.
- [ ] Happy path, entry to exit: open the URL → sign-in shows "Claim this instance" → claim as the owner → documents page shows the Admin link → `/admin` → Generate invite → dialog with the full URL in a read-only field → Copy link → "Invite link copied" → open the link in a private window → "You were invited" → create Eve → Eve on documents, no Admin link → back on `/admin`, the invite reads Accepted and Eve is listed.
- [ ] Empty: `/admin` on a fresh claim; expected: Users shows only the admin, Invites shows "No invites yet."
- [ ] Single: one pending invite; expected: one row, Pending, Revoke visible.
- [ ] Many: five invites generated; expected: five rows newest first; revoke the oldest; expected: Revoked, and its link shows the invalid message.
- [ ] Rejected input: `/sign-up?invite=garbage`; expected: invalid message, no form, nothing in the network log besides the 404 on `/api/invites/garbage`.
- [ ] Rejected input: a 3-character password through an invite; expected: the existing validation message, invite still pending.
- [ ] Rejected input: `POST /api/auth/admin/impersonate-user` with the admin's cookie (through the browser console or curl); expected: 404.
- [ ] Browser Back mid-flow: on "You were invited", press Back; expected: previous page, invite still pending, reopening the link shows the form again.
- [ ] Reload mid-flow: reload "You were invited" before submitting; expected: the form again (the token is consumed only on success).
- [ ] Two authors in two browser contexts at once: the admin generates an invite while Eve, in another context, opens `/admin`; expected: Eve is redirected with "Admins only" and the admin's table is unaffected.
- [ ] Latency / disconnect: cut the network while clicking Generate invite; expected: no dialog, `ACTION_FAILED_MESSAGE` next to the button, no phantom row after reconnect and reload.
- [ ] Clipboard denied: block clipboard permissions on the context, generate; expected: the dialog shows the URL, Copy link shows `COPY_FAILED_MESSAGE`, the URL can be selected.
- [ ] Console and network clean: zero console errors, zero failed requests other than the expected 404 on dead invite lookups, the 403 on the refused sign-up and the 404 on the plugin endpoint probe.
- [ ] Desktop width 1280: both tables readable without horizontal page scroll.
- [ ] Narrow width 375: tables scroll inside their border, Generate reachable, the header shows the Admin link without overflow, the dialog's URL field wraps or scrolls and Copy stays visible.
- [ ] Screenshots at `docs/features/invite-only-access/media/` (claim, invited, admin page with the dialog, invalid invite); video at the same folder; `docs/media/readme/09-admin-invites.png` for the README.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: a dead invite can never create a user, even under concurrency — attack: two parallel sign-ups with one token; a revoke racing a sign-up; `accept` forced to return false; result: <refuted | held>
- [ ] Claim 2: no request creates an account or changes a role outside the gate and the admin routes, admin or not — attack: every `/api/auth/admin/*` path with the admin cookie, including case, encoding and dot-segment variants; `role` in the sign-up body and in `/update-user`; result: <refuted | held>
- [ ] Claim 3: the instance never ends up with zero or two admins — attack: two concurrent first sign-ups, twenty rounds; two admins demoting each other concurrently; the last admin demoting themselves; result: <refuted | held>

## Coverage honesty

- The claim flow is not in the Playwright suite (the shared stack is seeded and therefore claimed); it is pinned by real-HTTP server tests and by the MCP walk on a fresh stack.
- The plugin's own endpoints are covered by a 404 per listed path plus the reviewer's variant probe, not by an exhaustive list of every plugin route.
- The 403 that follows a deleted post-gate user still carries a `Set-Cookie` for a session that no longer exists; the cookie is dead because the session row cascades. Not tested beyond the user count.
- Browser-zone rendering of invite times is asserted against `formatTimestamp`'s output, not a literal; zone correctness itself is the `timezone-preference` feature.
