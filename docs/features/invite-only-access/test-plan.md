# Test plan: Invite-only access

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path). Written before the build, from `spec.md` and `plan.md`.

## The failing test first

- [ ] `apps/server/src/auth/sign-up-gate.test.ts::a sign-up without a token on a claimed instance is refused and creates no user` — input: claimed test server, POST sign-up with no header; expected before the build: `expected 200 to be 403`.
- [ ] Confirmed it fails for the right reason: the server accepted the sign-up (200), not a missing module or a helper error.

## Unit — libs/types

- [ ] `invites.test.ts` — `inviteStateOf` for pending, accepted, revoked, expired; revoked wins over expired; accepted before expiry stays accepted; expiry exactly at `now` is expired.
- [ ] `routes.test.ts` — `inviteApiPath('a b')` → `/api/invites/a%20b`; `signUpPagePath('x/y')` → `/sign-up?invite=x%2Fy`; `adminApiPath` for both resources.

## Unit — server

- [ ] `auth/token-hash.test.ts` — sha256 hex, 64 characters, deterministic, not equal to the token.
- [ ] `auth/session.test.ts` — an invited user's session carries `role: 'user'`; the test admin's carries `'admin'`.
- [ ] `admin/invites.test.ts` — create stores only the hash and returns a URL containing the token once; accept is single use; revoke outcomes (revoked, already-accepted, not-found); expiry after seven days and not before; list names creator and acceptor, newest first.
- [ ] `auth/sign-up-gate.test.ts` — first sign-up on an unclaimed instance is admin; claimed without token → 403 with `SIGN_UP_BY_INVITATION_MESSAGE` and zero rows; pending token admits once and the user is `'user'`; revoked, expired and unknown tokens → 403; a token used by two concurrent sign-ups admits exactly one and leaves one user; two concurrent first sign-ups leave exactly one admin.
- [ ] `auth/seed-demo-users.test.ts` — the seed claims with `admin@example.com` first, admits Ana, Bruno, Caio and Dani as users by invite, and a second run creates nothing and no new invites.
- [ ] `admin/setup-routes.test.ts` — `/api/setup` is `{ claimed: false }` on an empty database and `{ claimed: true }` after the first sign-up.
- [ ] `admin/invite-routes.test.ts` — pending → `{ state: 'pending' }`; revoked and unknown → 404.
- [ ] `admin/admin-routes.test.ts` — five routes × (signed out → 401, user → 403); users listed with roles and `createdAt` numbers; create → 201 with a URL that admits one sign-up; revoke → 204 / 409 / 404; set role → 200, last admin → 409 `LAST_ADMIN_MESSAGE`, unknown → 404, bad role → 400.
- [ ] `admin/promote.test.ts` — promotes an existing email; reports an unknown one.
- [ ] Every pre-existing server test still passes (they sign up through invites now) — expected: `pnpm --filter @superdoc-history/server test:unit` green, count ≥ the current 383.
- [ ] `repository-shape/compose.test.ts`, `entrypoint.test.ts`, `delivery-docs.test.ts` — production compose sets `SEED_DEMO_USERS` to `false` and never reads `DEMO_PASSWORD`; the README configuration table lists every compose variable; the agent prompt names `AUTH_SECRET`, `APP_ORIGIN`, `SEED_DEMO_USERS=false` and ends with the claim step.
- [ ] Edge: a sign-up whose `after` hook throws after the user insert — input: force `invites.accept` to return false; expected: the user row is deleted and the response is 403 (covered by the concurrent-token test).
- [ ] Edge: `readSession` with a user row whose `role` is empty — expected: throws `Session user has no role.`, never a silent `'user'`.

## Unit — web

- [ ] `auth/sign-up-page.test.tsx` — unclaimed → "Claim this instance" heading and the form; claimed without token → invalid message, no form; pending token → "You were invited"; revoked token → invalid message; submit sends `x-invite-token` and a 403 shows the server's sentence.
- [ ] `auth/sign-in-page.test.tsx` — claim link only while unclaimed; no sign-up link once claimed; nothing while setup is loading.
- [ ] `auth/use-auth-submit.test.tsx` — 401 and 429 messages unchanged; 403 passes the server message.
- [ ] `admin/admin-page.test.tsx` — users with roles, no toggle on self; generate copies the URL, shows "Invite link copied", refetches; revoke refetches; make admin posts and refetches; times rendered via `formatDateTime`.
- [ ] `admin/require-admin.test.tsx` — user → documents + "Admins only" toast; signed out → sign-in with `next`; admin → children.
- [ ] `documents/documents-page.test.tsx` — Admin link only for admins.

## E2E (Playwright specs)

- [ ] `e2e/auth.spec.ts::sign-up without an invite is refused once the instance is claimed` — steps: open `/sign-up`; expected: the invalid message, no Sign up button.
- [ ] `e2e/admin.spec.ts::an admin invites a user who joins…` — steps: admin opens `/admin`, generates, the URL is accepted in a second context as Eve; expected: Eve lands on documents without an Admin link; the admin's list shows accepted and Eve in users.
- [ ] `e2e/admin.spec.ts::an invite link cannot be used twice` — expected: second context sees the invalid message.
- [ ] `e2e/admin.spec.ts::a revoked invite shows the invalid message`.
- [ ] `e2e/admin.spec.ts::a user opening /admin is sent to documents with the admins-only toast`.
- [ ] The whole suite: `pnpm test:e2e` green (every existing spec still signs in as a seeded user).

## Prove it for real — Playwright MCP

Against a fresh local stack with `SEED_DEMO_USERS=false` (`docker compose up --build` with an empty volume), then against the deployed instance after the merge.

- [ ] Happy path, entry to exit: open the URL → sign-in shows "Claim this instance" → claim as the owner → documents page shows the Admin link → `/admin` → Generate invite → toast "Invite link copied" → open the link in a private window → "You were invited" → create Eve → Eve on documents, no Admin link → back on `/admin`, the invite reads accepted and Eve is listed.
- [ ] Empty: `/admin` on a fresh claim; expected: the users table shows only the admin, the invites table shows the empty-state paragraph.
- [ ] Single: one pending invite; expected: one row, state pending, Revoke visible.
- [ ] Many: five invites generated; expected: five rows newest first; revoke the oldest; expected: that row reads revoked and its link shows the invalid message.
- [ ] Rejected input: `/sign-up` with `?invite=garbage`; expected: invalid message, no form, nothing in the network log besides the 404 on `/api/invites/garbage`.
- [ ] Rejected input: sign-up form with a 3-character password through an invite; expected: the existing validation message, invite still pending.
- [ ] Browser Back mid-flow: on "You were invited", press Back; expected: previous page, the invite still pending, reopening the link shows the form again.
- [ ] Reload mid-flow: reload "You were invited" before submitting; expected: the form again (the token is only consumed on success).
- [ ] Two authors in two browser contexts at once: the admin generates an invite while Eve, in another context, is on `/admin`; expected: Eve is redirected with "Admins only" and the admin's table is unaffected.
- [ ] Latency / disconnect: cut the network while clicking Generate invite; expected: no toast, an error state on the button, no phantom row after reconnect and reload.
- [ ] Console and network clean: zero console errors, zero failed requests other than the expected 404 on dead invite lookups and 403 on the refused sign-up.
- [ ] Desktop width 1280: users and invites tables side by side or stacked without horizontal scroll.
- [ ] Narrow width 375: tables scroll horizontally inside their border, the Generate button stays reachable, the header shows the Admin link without overflow.
- [ ] Screenshots at `docs/features/invite-only-access/media/` (claim, invited, admin page, invalid invite); video at the same folder.

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: a dead invite can never create a user, even under concurrency — attack: two parallel sign-ups with the same token, and a revoke racing a sign-up; result: <refuted | held>
- [ ] Claim 2: no route creates an account outside the gate — attack: read every call to `signUpEmail`, `createUser` (admin plugin) and the Better Auth endpoints exposed under `/api/auth/*`; `admin.createUser` from the plugin must be unreachable or refused for non-admins; result: <refuted | held>
- [ ] Claim 3: the instance can never end up without an admin through the UI or the API — attack: demote via API with a stale admin list, two admins demoting each other concurrently; result: <refuted | held>

## Coverage honesty

- The claim flow is not in the Playwright suite (the shared stack is seeded and therefore claimed); it is pinned by real-HTTP server tests and by the MCP walk on a fresh stack.
- The Better Auth `admin` plugin exposes its own endpoints (`/api/auth/admin/*`, such as `create-user`, `set-role`, `ban-user`) guarded by the plugin's own role check; the plan does not add tests for each, only the reviewer's Claim 2 reads them. If the review finds one reachable by a non-admin, it becomes a test and a fix before the PR.
- Browser zone rendering of invite times is asserted against `formatDateTime`'s output, not a literal; zone correctness itself is the `timezone-preference` feature.
