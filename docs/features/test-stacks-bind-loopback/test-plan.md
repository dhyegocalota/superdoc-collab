# Test plan: Test stacks bind loopback

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/config/environment.test.ts::binds the address HOST names and every interface without it` — input: `HOST=127.0.0.1` and `HOST=`; expected: `'127.0.0.1'` and `null` — evidence: red at c3a8f68 fails, green at a4bd8e4 in the full unit run, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-red.log and /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-unit.log
- [x] Confirmed it fails for the right reason at the red commit: `host` undefined where `null` is expected, and `HOST` not read — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-red.log: `expected undefined to be '127.0.0.1'` (HOST not read) and `parses a complete environment` missing `host: null`; 2 failed, 23 passed

## Unit

- [x] `environment.test.ts::parses a complete environment` — input: no `HOST`; expected: `host: null` in the parsed environment — evidence: green in /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-unit.log (only failure is scenario-stack.test.ts)
- [x] `server.test.ts::startServer rejects instead of hanging when the port is taken` — input: a blocker on `127.0.0.1:<port>`; expected: rejects with `EADDRINUSE` — evidence: green in /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-unit.log
- [x] `pnpm --filter @superdoc-collab/server test:unit`; expected: green — evidence: at 998f76f, 62 files and 513 tests passed, 2 skipped, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-unit2.log; `pnpm typecheck` exit 0, tbl-typecheck2.log beside it (the run at a4bd8e4 had 1 failure, fixed in f8b0cad)

## E2E (Playwright specs)

- [x] `pnpm test:e2e`; expected: 39 passed, the stack bound to loopback — evidence: CI e2e run 39056125897 on PR #36 at 998f76f: success; verify run 39056125866: success

## Prove it for real

- [x] With `pnpm scenario:stack` up: `lsof -nP -iTCP:3200 -sTCP:LISTEN`; expected: `127.0.0.1:3200`, never `*:3200` — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-lsof.log: `TCP 127.0.0.1:3200 (LISTEN)`, log line `listening on 127.0.0.1:3200`
- [x] `curl --silent --max-time 2 http://<lan-ip>:3200/api/health` from the same machine (the LAN address from `ipconfig getifaddr en0`); expected: connection refused — evidence: LAN 192.168.100.57: curl exit 7 (connection refused), http_code 000; loopback returned {"status":"ok"} 200; stack stopped with kill -TERM
- [x] Server started without `HOST` (for example `HOST= node apps/server/dist/main.js` with the other variables); expected: the log line reads `listening on :<port>` and `lsof` shows `*:<port>` — evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-nohost.log: `listening on :3201`; /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-nohost-lsof.log: `TCP *:3201 (LISTEN)`

## Edge cases found during execution

- **Fixed in f8b0cad (verified at 998f76f):** `apps/server/src/repository-shape/scenario-stack.test.ts` `EXPECTED_KEYS` lacks `HOST`, so `stackEnvironment()` now returns 13 keys against 12 expected and the unit suite is red. Reproduce: `pnpm --filter @superdoc-collab/server test:unit`. Expected green, observed 1 failed. Fix: add `HOST` to `EXPECTED_KEYS` and assert `environment.HOST` is `127.0.0.1`. Evidence: /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/scratchpad/tbl-unit.log.

## Adversarial review

- [x] Claim 1: the container is unaffected — attack: read `docker/Dockerfile`, `deploy/docker-compose.yml` and the CI docker job for any `HOST`; result: **held** — evidence: reviewer: no `HOST` in docker/, deploy/, .github or the Railway runbook; compose has no env_file; tester: unset `HOST` → `listening on :3201`, `lsof` `*:3201`
- [x] Claim 2: every E2E and scenario URL goes through `127.0.0.1` — attack: grep `localhost` in `e2e/` and `playwright.config.ts`; result: **held** — evidence: reviewer: zero hits; every URL goes through `localOrigin`; `apps/web/vite.config.ts` names localhost only for `pnpm dev`, where `HOST` is unset
- [x] Claim 3: `HOST=` (empty) means every interface, not a bind to the empty string — attack: read `presentOrNull` and `listen`; result: **held** — evidence: empty → null → no `hostname` spread; the environment test pins `HOST=''` → null; reviewer also reverted the port-taken blocker to every interface and saw the test go red, so the loopback blocker proves a real collision

## Coverage honesty

- IPv6 loopback (`::1`) is not bound; nothing in the repository uses it.
