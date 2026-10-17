# Test stacks bind loopback

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 ("fix os 5 achados", finding 5 after PR #31; ADR 0023 → Revisit when)
**ADRs:** [0023](../../adr/0023-agentic-scenario-runs-with-one-browser-per-author.md)
**Not changing:** the container, which keeps binding every interface because Traefik reaches it over the Docker network; `APP_ORIGIN`; the ports.

## Problem

Hono's `serve()` received no hostname, so every server, the E2E stack and the scenario stack included, listened on every interface. On a laptop that put the demo accounts (public password) within reach of the local network for the length of a run, with `TRUST_PROXY=true` letting a client spoof `X-Forwarded-For` past the rate limits.

## Change

- `HOST` becomes an optional environment variable: present → the server binds that address; absent or empty → every interface, as before. Modelled as `host: string | null` on `Environment` and `RunningServer`; never a silent default.
- `e2e/stack.ts` sets `HOST=127.0.0.1`, so the E2E and scenario stacks bind loopback; `localOrigin` uses the same constant.
- The in-process test servers (`testing/test-server.ts`) bind loopback too; the port-taken test's blocker listens on loopback as well, because a port held on every interface does not stop a loopback bind on macOS.
- The start-up log prints the bound address.
- `.env.example` documents `HOST` as optional and empty for the container.

## Tests

- Unit `config/environment.test.ts`: `HOST=127.0.0.1` → `host: '127.0.0.1'`; empty or absent → `null` (red first).
- Unit `server.test.ts`: the port-taken test still rejects with `EADDRINUSE` when the blocker holds the loopback port.
- E2E suite green (the stack now binds loopback; every spec reaches it through `127.0.0.1`).
- Proof: with the E2E or scenario stack up, `lsof -nP -iTCP:3100 -sTCP:LISTEN` shows `127.0.0.1:3100`, not `*:3100`.
