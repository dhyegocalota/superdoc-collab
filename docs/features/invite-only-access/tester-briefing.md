# Tester briefing: Invite-only access

Written by the lead from the four developer reports. Nobody on the build side ran `test-plan.md`.

## What changed

- `libs/types`: `UserRole`, `InviteState`, `inviteStateOf`, `INVITE_TOKEN_HEADER`, `INVITE_TTL_MS`, `DAY_MS`, admin and invite paths, `signUpSchema` requires `timeZone` (IANA, `UTC` accepted explicitly because `Intl.supportedValuesOf('timeZone')` omits it in Node), `SessionUser` gains `role` and `timeZone`, `DEMO_ADMIN`.
- `apps/server`: Better Auth `admin` plugin and `timeZone` additional field; migration `0004` (user role, ban fields, `time_zone`; session `impersonated_by`; `invites` table); `auth/token-hash.ts` shared with share links; `admin/invites.ts` (`InvitesRepository`); `auth/sign-up-gate.ts` (local plugin, matcher hooks on `/sign-up/email`, conditional admin claim, invite consumption, delete-and-403 otherwise); test server claims with `admin@example.com` unless `claim: false`; seed claims first and admits the demo users by invite; setup, invite and admin routes; `/api/auth/admin/*` answers 404; `admin-promote` script and tsup entry.
- `apps/web`: setup and invite queries; sign-in shows "Claim this instance" only while unclaimed; sign-up has claim, invited and invalid states, sends the browser zone and the `x-invite-token` header; first sign-in backfills a missing zone once; `/admin` with Users and Invites tables (aria-labels "Users", "Invites"), the invite link dialog (read-only field, Copy link), role toggles, the role guard; Admin link in the documents header; `inferAdditionalFields` on the auth client (never `adminClient`).
- `e2e`: `admin.spec.ts` (serial), `auth.spec.ts` sign-up test replaced, fixtures for the admin, invite and opened contexts.
- Delivery: production compose sets `SEED_DEMO_USERS=false` and drops `DEMO_PASSWORD`; README rewritten with Quick start, Install on Railway, Install with an agent, First login, Invite your team, Configuration; Railway runbook gains "6. Claim the instance" and the seed warning.

## Known gaps to check, not to assume

- `docs/media/readme/09-admin-invites.png` is a placeholder copy of another screenshot; capture the real `/admin` page with the dialog open and overwrite it.
- The `x-invite-token` header reaching the server through Better Auth's `fetchOptions.headers` was verified only against mocks on the web side; the MCP walk proves it end to end.
- The deployed Railway instance still runs with `SEED_DEMO_USERS=true` and holds users from the first walk; do not deploy this branch there during testing.

## How to run

- Unit: `pnpm typecheck && pnpm test:unit`.
- E2E: `pnpm exec playwright install chromium && pnpm test:e2e` (builds and seeds its own stack; the stack is claimed by `admin@example.com` with `superdoc-demo`).
- Fresh, unclaimed stack for the MCP walk: `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=false docker compose up --build -d` on an empty volume (`docker compose down -v` first), then open <http://localhost:3000>. Use the Playwright context option `timezoneId: 'America/Sao_Paulo'`.
