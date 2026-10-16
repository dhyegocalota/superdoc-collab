# Bootstrap and auth — test plan

Executed by the `tester` sub-agent after `tester-briefing.md` exists. Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: <commit | log path | count | screenshot path>`. A box that cannot run is marked `BLOCKED: <why>`, never ticked.

Environment for the Playwright MCP walk: `pnpm build && WEB_DIST_DIR=apps/web/dist DATABASE_DIR=<temp> PORT=3100 pnpm --filter @superdoc-history/server start` after `pnpm seed`, so the walk runs against the production-shaped server, not the Vite dev server.

## The failing test first

- [ ] `libs/types/src/auth.test.ts::lowercases and trims the email` written before `auth.ts` — confirmed it fails for the right reason (module not found, then assertion)
- [ ] `apps/server/src/http/app.test.ts::wrong password and unknown email return the same status and body` written before `app.ts` — confirmed it fails for the right reason
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts::rejects an expired session cookie` written before the implementation — confirmed it fails for the right reason

## Unit

- [ ] `pnpm typecheck` from the root exits 0 with no output other than the package names
- [ ] `pnpm test:unit` from the root runs `libs/types`, `apps/server` and `apps/web` suites; zero failures, zero skipped
- [ ] Edge: `loadEnvironment` with each of `PORT`, `APP_ORIGIN`, `AUTH_SECRET`, `DATABASE_DIR` missing throws `MissingEnvironmentVariableError` naming that variable
- [ ] Edge: `loadEnvironment` with `AUTH_SECRET` of 31 characters throws mentioning `AUTH_SECRET`
- [ ] Edge: `openDatabase` on a read-only directory throws `DatabaseDirectoryNotWritableError`, not a SQLite stack trace
- [ ] Edge: `runMigrations` twice on the same file does not throw and leaves the same four tables
- [ ] Edge: `safeNextPath` returns `/documents` for `null`, `//evil.example`, `https://evil.example/x`, `documents`; returns the input for `/documents?x=1`
- [ ] Edge: `readSession` returns `null` for no cookie and for `better-auth.session_token=garbage`
- [ ] Edge: `seedDemoUsers` second run returns `{ created: [], existing: [4 emails] }`

## Integration (real HTTP, Vitest)

- [ ] `GET /api/health` → 200 `{"status":"ok"}`
- [ ] Sign-up `ana@example.com` → 200; sign-in → 200 with a `Set-Cookie` containing `HttpOnly`; `GET /api/me` with that cookie → `{ user: { id, name: 'Ana', email: 'ana@example.com' } }`
- [ ] `GET /api/me` without cookie → 401 JSON
- [ ] Sign-in with `"  ANA@example.com "` → 200
- [ ] Sign-in wrong password vs unknown email → identical status and identical body text
- [ ] Three concurrent sign-ups with the same email → exactly one row in `user`
- [ ] Four sign-ins within ten seconds from one client → at least one 429 with numeric `X-Retry-After`
- [ ] `GET /api/missing` → 404 JSON `{ error: 'Not found' }`; `GET /documents` with `WEB_DIST_DIR` set → 200 HTML containing `<div id="root">`
- [ ] WebSocket `/collaboration` with a valid session cookie → provider `onAuthenticated`
- [ ] WebSocket `/collaboration` without cookie → provider `onAuthenticationFailed`, socket closed, no reconnect storm (at most one attempt in the test log)
- [ ] WebSocket `/collaboration` with a cookie whose session row was deleted → `onAuthenticationFailed`
- [ ] WebSocket upgrade on any other path (`/ws`, `/api/auth`) → socket destroyed, server keeps serving HTTP afterwards

## E2E (Playwright specs, `pnpm test:e2e`)

- [ ] `a new user signs up and lands on documents` passes; the header shows the typed name
- [ ] `wrong password shows one generic message` passes; the page text never contains "not found" or "exists"
- [ ] `visiting documents signed out redirects to sign-in and returns after login` passes; URL after login is exactly `/documents`
- [ ] `sign out returns to sign-in and documents is protected again` passes
- [ ] `two users in two contexts see their own names` passes with `ana@example.com` and `bruno@example.com` from the seed
- [ ] `the fourth failed attempt shows the retry message` passes; the message contains a number of seconds
- [ ] `narrow viewport keeps the form usable` passes at 375×812: `document.documentElement.scrollWidth <= 375`, submit button in viewport
- [ ] The whole suite passes twice in a row (`pnpm test:e2e` ×2) with no retries configured

## Prove it for real — Playwright MCP

Walk as a brand-new user, then as the seeded `ana@example.com`. One browser context per user. Screenshots under `.pr-media/bootstrap-and-auth/`.

- [ ] Happy path, new user: `/` → redirected to `/sign-in` → link to sign up → fill name, email, password → submit → `/documents` shows "No documents yet" and the name in the header — screenshot `01-sign-up.png`, `02-documents-empty.png`
- [ ] Happy path, seeded user in a second context: sign in as Ana → header shows "Ana" while the first context still shows the new user's name — screenshot `03-two-users.png`
- [ ] Empty · single · many: form fields empty → submit → zod messages under each field, nothing sent (network shows no POST); one field filled → only the other complains; all filled with a 7-character password → password message only
- [ ] Rejected input: wrong password → exactly one generic message, field values preserved, no console error
- [ ] Browser Back mid-flow: after signing in, press Back → lands on `/sign-in` → which immediately redirects to `/documents` because the session exists (no flash of the form longer than the loading skeleton)
- [ ] Reload mid-flow: reload `/documents` → stays, no redirect, header name unchanged
- [ ] Sign out → `/sign-in`; press Back → `/documents` redirects to `/sign-in?next=%2Fdocuments`
- [ ] `next` tampering: open `/sign-in?next=//evil.example` and sign in → lands on `/documents`, not an external page
- [ ] Rate limit: four wrong passwords in a row → the fourth shows "Too many attempts. Try again in N seconds." with N a number; waiting N seconds then signing in correctly succeeds
- [ ] Expired session: delete the session row in the database (`sqlite3 <dir>/auth.sqlite 'DELETE FROM session'`) → click anything that refetches `['me']` or reload → redirected to `/sign-in` — no infinite redirect loop, no console error
- [ ] Collaboration socket from the browser: in the console, `new WebSocket(location.origin.replace('http','ws') + '/collaboration')` opens while signed in (readyState 1 within a second) and closes with code 1000-range quickly when signed out — evidence: console transcript
- [ ] Console: zero errors at `error` level across the whole walk; network: every `/api/*` call 2xx except the deliberate 401 and 429
- [ ] Desktop 1280 px and narrow 375 px: forms readable, no horizontal scroll, focus ring visible when tabbing through fields — screenshots `04-sign-in-desktop.png`, `05-sign-in-narrow.png`
- [ ] Docker: `docker compose up --build -d` → `curl -f localhost:3000/api/health` ok within 60 s; `/sign-in` renders; `docker compose down -v` leaves nothing running — evidence: terminal transcript
- [ ] Video: `walkthrough.mp4` and `walkthrough.gif` recorded by the `recorder` covering sign-up → documents → sign-out → sign-in as Ana

## Edge cases found during execution

(fill during the run; each new case gets a line here and a regression test request to the owning developer)

- [ ] 

## Adversarial review

The `reviewer` refutes the three claims most likely to be wrong:

- [ ] Claim "wrong password and unknown email are indistinguishable" — compare response timing across 20 attempts each; a consistent gap over 100 ms is a finding (timing enumeration)
- [ ] Claim "the socket rejects an expired session" — sign in, delete the session, open the socket within the same second; if Better Auth caches sessions in memory the socket must still fail
- [ ] Claim "no secrets in responses" — grep every response body and header in the E2E HAR for `AUTH_SECRET`'s value and for the session token appearing anywhere other than `Set-Cookie`

## Coverage honesty

Not tested in this slice, by decision:

- Password reset, email verification, OAuth: non-goals.
- Production TLS and `Secure` cookies behind Traefik: slice 5 (`deploy`); locally the cookie is not `Secure`.
- Dark mode rendering: tokens exist, no UI switch yet.
- Load: rate limiting is checked functionally, not under concurrency from many IPs.
- Hocuspocus document traffic: only authentication is covered here; documents and authorship arrive in slice 2.
