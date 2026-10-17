# Tester briefing: Test stacks bind loopback

## What changed

- `apps/server/src/config/environment.ts` — optional `HOST` → `host: string | null`.
- `apps/server/src/server.ts` — `listen` passes `hostname` when `host` is set; `RunningServer.host`.
- `apps/server/src/main.ts` — the log prints the bound address.
- `apps/server/src/testing/test-server.ts` — in-process test servers bind loopback; `LOOPBACK_HOST` exported.
- `apps/server/src/server.test.ts` — the port-taken blocker listens on loopback.
- `e2e/stack.ts` — `HOST=127.0.0.1` for the E2E and scenario stacks.
- `.env.example` — `HOST` documented, empty.

## How to run

```bash
pnpm --filter @superdoc-collab/server test:unit
pnpm scenario:stack          # then lsof -nP -iTCP:3200 -sTCP:LISTEN
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `environment.test.ts::binds the address HOST names and every interface without it` | `HOST` was not read | the loader returns it or null |
| `environment.test.ts::parses a complete environment` | no `host` key | `host: null` |
| `server.test.ts::startServer rejects…` | pin, but it regressed mid-change: a blocker on every interface does not stop a loopback bind on macOS | the blocker listens on loopback |

Red commit: `c3a8f68`.

## Hypotheses to attack

1. Hypothesis: the container still binds every interface. Break it by: `grep -rn HOST docker/ deploy/ .github/workflows/verify.yml`.
2. Hypothesis: no E2E spec reaches the stack through a hostname other than `127.0.0.1`. Break it by: `rg localhost e2e playwright.config.ts`.
3. Hypothesis: the port-taken test proves the real failure, not a vacuous one. Break it by: start the blocker on every interface again in a scratch copy and watch the test resolve.

## Known gaps

- The Docker CI job is the only proof the container keeps its behaviour; it runs on the PR.
