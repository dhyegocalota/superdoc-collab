# Test plan: Test stacks bind loopback

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/config/environment.test.ts::binds the address HOST names and every interface without it` — input: `HOST=127.0.0.1` and `HOST=`; expected: `'127.0.0.1'` and `null`
- [ ] Confirmed it fails for the right reason at the red commit: `host` undefined where `null` is expected, and `HOST` not read

## Unit

- [ ] `environment.test.ts::parses a complete environment` — input: no `HOST`; expected: `host: null` in the parsed environment
- [ ] `server.test.ts::startServer rejects instead of hanging when the port is taken` — input: a blocker on `127.0.0.1:<port>`; expected: rejects with `EADDRINUSE`
- [ ] `pnpm --filter @superdoc-collab/server test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `pnpm test:e2e`; expected: 39 passed, the stack bound to loopback

## Prove it for real

- [ ] With `pnpm scenario:stack` up: `lsof -nP -iTCP:3200 -sTCP:LISTEN`; expected: `127.0.0.1:3200`, never `*:3200`
- [ ] `curl --silent --max-time 2 http://<lan-ip>:3200/api/health` from the same machine (the LAN address from `ipconfig getifaddr en0`); expected: connection refused
- [ ] Server started without `HOST` (for example `HOST= node apps/server/dist/main.js` with the other variables); expected: the log line reads `listening on :<port>` and `lsof` shows `*:<port>`

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the container is unaffected — attack: read `docker/Dockerfile`, `deploy/docker-compose.yml` and the CI docker job for any `HOST`; result: <refuted | held>
- [ ] Claim 2: every E2E and scenario URL goes through `127.0.0.1` — attack: grep `localhost` in `e2e/` and `playwright.config.ts`; result: <refuted | held>
- [ ] Claim 3: `HOST=` (empty) means every interface, not a bind to the empty string — attack: read `presentOrNull` and `listen`; result: <refuted | held>

## Coverage honesty

- IPv6 loopback (`::1`) is not bound; nothing in the repository uses it.
