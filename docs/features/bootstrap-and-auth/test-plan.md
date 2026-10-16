# Bootstrap and auth — test plan

Executed by the `tester` sub-agent after `tester-briefing.md` exists. Every box states the input and the exact expected outcome; ticked boxes carry ` — evidence: <commit | log path | count | screenshot path>`. A box that cannot run is marked `BLOCKED: <why>`, never ticked.

Environment for the Playwright MCP walk: `pnpm build && WEB_DIST_DIR=apps/web/dist DATABASE_DIR=<temp> PORT=3100 pnpm --filter @superdoc-history/server start` after `pnpm seed`, so the walk runs against the production-shaped server, not the Vite dev server.

## The failing test first

- [ ] `libs/types/src/auth.test.ts::lowercases and trims the email` written before `auth.ts` — confirmed it fails for the right reason (module not found, then assertion) — BLOCKED: red-first order is not provable after the fact; git shows test and implementation landing in the same commit (8ce70b3)
- [ ] `apps/server/src/http/app.test.ts::wrong password and unknown email return the same status and body` written before `app.ts` — confirmed it fails for the right reason — BLOCKED: test and implementation share commit 42a0495; red-first order not provable
- [ ] `apps/server/src/collaboration/collaboration-server.test.ts::rejects an expired session cookie` written before the implementation — confirmed it fails for the right reason — BLOCKED: test and implementation share commit 9615dce; red-first order not provable

## Unit

- [x] `pnpm typecheck` from the root exits 0 with no output other than the package names — evidence: exit 0; libs/types, apps/server, apps/web and e2e project all Done
- [x] `pnpm test:unit` from the root runs `libs/types`, `apps/server` and `apps/web` suites; zero failures, zero skipped — evidence: exit 0; types 3/3, server 45/45 (10 files), web 13/13 (4 files); no skipped
- [x] Edge: `loadEnvironment` with each of `PORT`, `APP_ORIGIN`, `AUTH_SECRET`, `DATABASE_DIR` missing throws `MissingEnvironmentVariableError` naming that variable — evidence: environment.test.ts test.each over PORT, APP_ORIGIN, AUTH_SECRET, DATABASE_DIR, TRUST_PROXY passes
- [x] Edge: `loadEnvironment` with `AUTH_SECRET` of 31 characters throws mentioning `AUTH_SECRET` — evidence: tsx run: 31 chars throws zod too_small minimum 32, 32 chars ok; unit test covers the short secret
- [x] Edge: `openDatabase` on a read-only directory throws `DatabaseDirectoryNotWritableError`, not a SQLite stack trace — evidence: connection.test.ts "fails with a named error when the directory is not writable" passes
- [x] Edge: `runMigrations` twice on the same file does not throw and leaves the same four tables — evidence: migrate.test.ts "migrating twice is idempotent" passes; live DB tables: account, session, user, verification (+ __drizzle_migrations)
- [x] Edge: `safeNextPath` returns `/documents` for `null`, `//evil.example`, `https://evil.example/x`, `documents`; returns the input for `/documents?x=1` — evidence: safe-next-path.test.ts 6 cases pass; see defect 2 for the backslash gap
- [x] Edge: `readSession` returns `null` for no cookie and for `better-auth.session_token=garbage` — evidence: session.test.ts "returns null without a cookie" and "returns null for a garbage cookie" pass
- [x] Edge: `seedDemoUsers` second run returns `{ created: [], existing: [4 emails] }` — evidence: seed-demo-users.test.ts passes; live: node dist/seed.js printed "existing: " empty then in Docker restart "created: " empty and 4 existing

## Integration (real HTTP, Vitest)

- [x] `GET /api/health` → 200 `{"status":"ok"}` — evidence: curl 127.0.0.1:3200 -> 200 {"status":"ok"}
- [x] Sign-up `ana@example.com` → 200; sign-in → 200 with a `Set-Cookie` containing `HttpOnly`; `GET /api/me` with that cookie → `{ user: { id, name: 'Ana', email: 'ana@example.com' } }` — evidence: curl sign-up zed@example.com 200; sign-in 200 with Set-Cookie better-auth.session_token ... HttpOnly; SameSite=Lax; /api/me -> {"user":{"id","name":"Zed","email":"zed@example.com"}}
- [x] `GET /api/me` without cookie → 401 JSON — evidence: 401 {"error":"Unauthorized"}
- [x] Sign-in with `"  ANA@example.com "` → 200 — evidence: "  ZED@example.com " -> 200 with session cookie
- [x] Sign-in wrong password vs unknown email → identical status and identical body text — evidence: 401 and identical body {"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"} for both
- [x] Three concurrent sign-ups with the same email → exactly one row in `user` — evidence: 3 parallel POSTs -> 200,422,422; sqlite select count = 1 for dup@example.com
- [x] Four sign-ins within ten seconds from one client → at least one 429 with numeric `X-Retry-After` — evidence: 4th request in window -> 429 with X-Retry-After: 10 (curl); browser countdown 10 -> 5 seconds
- [x] `GET /api/missing` → 404 JSON `{ error: 'Not found' }`; `GET /documents` with `WEB_DIST_DIR` set → 200 HTML containing `<div id="root">` — evidence: 404 {"error":"Not found"}; /documents and /documents/abc return HTML containing <div id="root">
- [x] WebSocket `/collaboration` with a valid session cookie → provider `onAuthenticated` — evidence: HocuspocusProvider with real cookie and Origin -> AUTHENTICATED against the built server on 3200
- [x] WebSocket `/collaboration` without cookie → provider `onAuthenticationFailed`, socket closed, no reconnect storm (at most one attempt in the test log) — evidence: provider -> AUTH_FAILED with one socket open (maxAttempts 3, socketOpens 1). Raw socket without Origin is refused at upgrade (1006). See defect 3 for idle unauthenticated sockets
- [x] WebSocket `/collaboration` with a cookie whose session row was deleted → `onAuthenticationFailed` — evidence: sessions deleted via sqlite, provider reconnect with the old cookie -> AUTH_FAILED; also signed-out cookie -> /api/me 401
- [x] Static serving cannot escape the dist directory: `GET /../package.json`, `GET /%2e%2e/package.json` and `GET /static/../../.env` → 404 or `index.html`, never file contents from outside `WEB_DIST_DIR`; a deep route `GET /documents/abc` → `index.html` — evidence: /../package.json, /%2e%2e/package.json, /static/../../.env, /..%2fpackage.json, /%252e%252e/package.json, //etc/passwd (path-as-is) all 200 with index.html content only; /documents/abc -> index.html
- [x] WebSocket upgrade on any other path (`/ws`, `/api/auth`) → socket destroyed, server keeps serving HTTP afterwards — evidence: /ws and /api/auth upgrade -> socket hang up (1006); /api/health still 200 afterwards

## E2E (Playwright specs, `pnpm test:e2e`)

- [x] `a new user signs up and lands on documents` passes; the header shows the typed name — evidence: pnpm test:e2e run 1 and 2: 7 passed (4.8 s, 5.9 s)
- [x] `wrong password shows one generic message` passes; the page text never contains "not found" or "exists" — evidence: e2e run 1 and 2 pass
- [x] `visiting documents signed out redirects to sign-in and returns after login` passes; URL after login is exactly `/documents` — evidence: e2e run 1 and 2 pass
- [x] `sign out returns to sign-in and documents is protected again` passes — evidence: e2e run 1 and 2 pass
- [x] `two users in two contexts see their own names` passes with `ana@example.com` and `bruno@example.com` from the seed — evidence: e2e run 1 and 2 pass
- [x] `the fourth failed attempt shows the retry message` passes; the message contains a number of seconds — evidence: e2e run 1 and 2 pass
- [x] `narrow viewport keeps the form usable` passes at 375×812: `document.documentElement.scrollWidth <= 375`, submit button in viewport — evidence: e2e run 1 and 2 pass; MCP: scrollWidth 375/375 and 320/320 on sign-in, sign-up, documents
- [x] The whole suite passes twice in a row (`pnpm test:e2e` ×2) with no retries configured — evidence: two consecutive runs, 7/7 each, exit 0

## Prove it for real — Playwright MCP

Walk as a brand-new user, then as the seeded `ana@example.com`. One browser context per user. Screenshots under `.pr-media/bootstrap-and-auth/`.

- [x] Happy path, new user: `/` → redirected to `/sign-in` → link to sign up → fill name, email, password → submit → `/documents` shows "No documents yet" and the name in the header — screenshot `01-sign-up.png`, `02-documents-empty.png` — evidence: .pr-media/bootstrap-and-auth/01-sign-up.png, .pr-media/bootstrap-and-auth/02-documents-empty.png; "/" -> /sign-in?next=%2Fdocuments -> Sign up -> Nina Tester registered -> /documents shows "Nina Tester", "No documents yet"
- [x] Happy path, seeded user in a second context: sign in as Ana → header shows "Ana" while the first context still shows the new user's name — screenshot `03-two-users.png` — evidence: .pr-media/bootstrap-and-auth/03-two-users.png; Ana context shows "Ana", Nina context after reload still "Nina Tester"
- [x] Empty · single · many: form fields empty → submit → zod messages under each field, nothing sent (network shows no POST); one field filled → only the other complains; all filled with a 7-character password → password message only — evidence: empty submit: sign-in shows "Invalid email address" and "Too small: expected string to have >=8 characters"; email-only filled -> only password complains; 7 chars -> password message only; zero POSTs in network log. Raw zod wording is shown to users (defect 5)
- [x] Rejected input: wrong password → exactly one generic message, field values preserved, no console error — evidence: wrong password -> single alert "Invalid email or password.", email and password values preserved; console only shows the browser 401 resource line
- [ ] Browser Back mid-flow: after signing in, press Back → lands on `/sign-in` → which immediately redirects to `/documents` because the session exists (no flash of the form longer than the loading skeleton) — NOT PASSED: REFUTED: signed in, Back (and a fresh load of /sign-in) shows the sign-in form; no redirect to /documents. Defect 1
- [x] Reload mid-flow: reload `/documents` → stays, no redirect, header name unchanged — evidence: reload /documents stayed on /documents, header "Ana" unchanged
- [x] Sign out → `/sign-in`; press Back → `/documents` redirects to `/sign-in?next=%2Fdocuments` — evidence: sign out -> exactly /sign-in; Back -> /sign-in?next=%2Fdocuments; /documents signed out redirects to /sign-in?next=%2Fdocuments; stale second tab also redirects on reload
- [ ] `next` tampering: open `/sign-in?next=//evil.example` and sign in → lands on `/documents`, not an external page — PARTIAL: //evil.example and https://evil.example -> /documents; %2F%2Fevil.example -> /documents; /\evil.example stays on sign-in silently with a live session and logs "External navigation is not allowed"; /%5Cevil.example lands on same-origin unknown route with an application error page. No external navigation occurred. Defect 2
- [x] Rate limit: four wrong passwords in a row → the fourth shows "Too many attempts. Try again in N seconds." with N a number; waiting N seconds then signing in correctly succeeds — evidence: 3 wrong passwords then 4th shows "Too many attempts. Try again in 10 seconds."; other email from same client also limited ("5 seconds", countdown decreases); after waiting 11 s correct sign-in reached /documents
- [x] Expired session: delete the session row in the database (`sqlite3 <dir>/auth.sqlite 'DELETE FROM session'`) → click anything that refetches `['me']` or reload → redirected to `/sign-in` — no infinite redirect loop, no console error — evidence: DELETE FROM session (11 rows), reload /documents -> /sign-in?next=%2Fdocuments, stable after 3 s, only console line is the 401 resource log
- [ ] Collaboration socket from the browser: in the console, `new WebSocket(location.origin.replace('http','ws') + '/collaboration')` opens while signed in (readyState 1 within a second) and closes with code 1000-range quickly when signed out — evidence: console transcript — PARTIAL: signed in: readyState 1 in 3 ms. Signed out: socket also opens and stays open 20 s (auth happens on the first Hocuspocus message, not at upgrade), so "closes quickly" is refuted at raw level; the provider is rejected. Defect 3
- [ ] Console: zero errors at `error` level across the whole walk; network: every `/api/*` call 2xx except the deliberate 401 and 429 — PARTIAL: error-level messages are only browser "Failed to load resource" lines for deliberate 401 (/api/me signed out, sign-in), 429 and one 422 (duplicate sign-up), plus 3 uncaught "External navigation is not allowed" from defect 2; every other /api call 2xx. Signed-out landing logs a console error from /api/me 401 (defect 4)
- [x] Desktop 1280 px and narrow 375 px: forms readable, no horizontal scroll, focus ring visible when tabbing through fields — screenshots `04-sign-in-desktop.png`, `05-sign-in-narrow.png` — evidence: .pr-media/bootstrap-and-auth/04-sign-in-desktop.png, .pr-media/bootstrap-and-auth/05-sign-in-narrow.png, .pr-media/bootstrap-and-auth/06-documents-narrow.png, .pr-media/bootstrap-and-auth/07-focus-ring.png; scrollWidth equals innerWidth at 375 and 320 incl. 90-char email and 120-char password; focus ring visible on the email field
- [ ] Docker: `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d` → `curl -f localhost:3000/api/health` ok within 60 s; `curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"ana@example.com","password":"superdoc-demo"}' localhost:3000/api/auth/sign-in/email` prints 200; `/sign-in` renders; `docker compose down -v` leaves nothing running — evidence: terminal transcript — NOT PASSED: REFUTED with the documented command: APP_ORIGIN and SEED_DEMO_USERS are not forwarded into the container (env_file wins), so the container has APP_ORIGIN=http://localhost:5173, 0 users, and sign-in at localhost:3000 returns 403 INVALID_ORIGIN. With a temp env file setting both, it worked: healthy, /documents and /sign-in 200, 4 users created, restart keeps volume ("existing" x4), sign-in 200, traversal 200 index only; docker compose down -v left 0 containers and 0 volumes. Defect 6
- [ ] Video: `walkthrough.mp4` and `walkthrough.gif` recorded by the `recorder` covering sign-up → documents → sign-out → sign-in as Ana — BLOCKED: recorder role

## Edge cases found during execution

(fill during the run; each new case gets a line here and a regression test request to the owning developer)

- [ ] Defect 1 (medium): signed in, open `/sign-in` (Back or direct) -> expected redirect to `/documents`, observed the sign-in form with a live session. Regression test requested: web test for `/sign-in` with a session redirects to `next`/`/documents`
- [ ] Defect 2 (medium): `next=/\\evil.example` -> `safeNextPath` returns it unchanged; after a successful sign-in the router refuses ("External navigation is not allowed" in console) and the user is left on the form with a session and no message. `next=/%5Cevil.example` navigates to an unknown same-origin route showing the router "Unexpected Application Error!" page. Expected `/documents`. Regression test requested: add backslash and encoded-backslash rows to `safe-next-path.test.ts`
- [ ] Defect 3 (low/medium): `WebSocket('/collaboration')` without any cookie opens and stays open at least 20 s; Hocuspocus only rejects on the first auth message. Idle unauthenticated sockets are never closed. Regression test requested: socket without a cookie is closed within a bounded time
- [ ] Defect 4 (low): signed-out first load logs a console error for `GET /api/me` 401 on every visit to `/` or `/documents`. Plan wants zero console errors; consider `/api/me` returning 200 `{user:null}` or accepting it as documented noise
- [ ] Defect 5 (low): client validation shows raw zod text ("Too small: expected string to have >=8 characters") on sign-in and sign-up; user-facing copy expected
- [ ] Defect 6 (high): documented Docker command `ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d` does not pass `APP_ORIGIN` or `SEED_DEMO_USERS` into the container (`docker-compose.yml` has only `env_file` plus fixed `environment`). Observed: container `APP_ORIGIN=http://localhost:5173`, user count 0, sign-in from `http://localhost:3000` -> 403 `INVALID_ORIGIN`. Expected seeded users and working sign-in. Regression: compose `environment` should interpolate them, plus a CI smoke
- [x] Unknown deep route `/documents/abc` signed out/in renders the router default "Unexpected Application Error! 404 Not Found" (low; no catch-all route yet) — evidence: browser snapshot
- [x] Duplicate sign-up with an existing email -> 422, form shows only "Something went wrong. Try again." (enumeration-safe) — evidence: browser run, console 422 line
- [x] Raw WebSocket upgrade with a valid cookie but no `Origin` header, or with `Origin: http://evil.example`, is refused at upgrade (1006 / error event) — evidence: ws client transcript
- [x] Concurrent sign-in from two contexts as the same user does not interfere; two contexts keep distinct names — evidence: .pr-media/bootstrap-and-auth/03-two-users.png
- [x] 90-char email and 120-char password at 320 px: no horizontal scroll, generic message — evidence: scrollWidth 320/320

## Adversarial review

The `reviewer` refutes the three claims most likely to be wrong:

- [x] Claim "wrong password and unknown email are indistinguishable" — compare response timing across 20 attempts each; a consistent gap over 100 ms is a finding (timing enumeration) — evidence: 20 attempts requested but the 3-per-10 s limit allowed 7 per kind over ~75 s: known email avg 50.7 ms vs unknown avg 42.2 ms, gap about 9 ms, under 100 ms
- [x] Claim "the socket rejects an expired session" — sign in, delete the session, open the socket within the same second; if Better Auth caches sessions in memory the socket must still fail — evidence: sessions deleted then immediate provider connect -> AUTH_FAILED; Better Auth did not serve a cached session
- [ ] Claim "no secrets in responses" — grep every response body and header in the E2E HAR for `AUTH_SECRET`'s value and for the session token appearing anywhere other than `Set-Cookie` — PARTIAL: Not a HAR audit: responses of sign-up/sign-in/me checked; Set-Cookie carries the token, bodies do not. Server log shows no secret. /get-session body token is a known gap

## Coverage honesty

Not tested in this slice, by decision:

- Password reset, email verification, OAuth: non-goals.
- Production TLS and `Secure` cookies behind Traefik: slice 5 (`deploy`); locally the cookie is not `Secure`.
- Dark mode rendering: tokens exist, no UI switch yet.
- Load: rate limiting is checked functionally, not under concurrency from many IPs.
- Hocuspocus document traffic: only authentication is covered here; documents and authorship arrive in slice 2.

