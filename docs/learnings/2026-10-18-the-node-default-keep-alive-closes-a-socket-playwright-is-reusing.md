# One request per E2E run fails with `read ECONNRESET` on a plain GET

- Date: 2026-10-18
- Inspired by: the one-per-run `apiRequestContext.get: read ECONNRESET` on `page.request.get` across lanes, last at `e2e/timeline.spec.ts:100`

## Signal

A full E2E run is red on one test with `apiRequestContext.get: read ECONNRESET` at a `page.request.get` call, never the same spec, and the test passes alone.

## Cause

The Hono Node server ran on Node's defaults, and Node closes an idle keep-alive socket after 5 s. Playwright's request context reuses sockets, so a GET sent just as the server closes an idle one is reset. Load makes the gap between requests land near the limit more often. This is a hypothesis fitted to the evidence, not reproduced.

## Do

Keep `keepAliveTimeout` (65 s) and `headersTimeout` (just above it) on the server, in `server.ts`. If the error survives, retry the call with the `maxRetries` option of `request.get`, which retries only `ECONNRESET`.

## Anchor

`apps/server/src/server.ts` (`KEEP_ALIVE_TIMEOUT_MS`, `HEADERS_TIMEOUT_MS`), `apps/server/src/server.test.ts` (the keep-alive test), `e2e/timeline.ts` (`readAccountTimeZone`)
