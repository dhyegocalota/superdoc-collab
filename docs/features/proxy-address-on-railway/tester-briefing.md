# Tester briefing: Client address behind Railway's proxy

## What changed

- `apps/server/src/http/client-address.ts` — the address is `x-forwarded-for` entries counted from the right by the hop count
- `apps/server/src/config/environment.ts` — `TRUSTED_PROXY_HOPS`, optional positive integer, default 1
- `apps/server/src/http/app.ts` — passes the hop count to the resolver
- `apps/server/src/testing/test-server.ts` — the test environment carries the hop count
- `docs/adr/0042-the-client-address-is-the-rightmost-trusted-hop.md`, `.env.example`, `docs/install.md`, `docs/features/deploy/runbook-railway.md`

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/http/client-address.test.ts src/config/environment.test.ts src/http/app.test.ts
```

Post-deploy probe, from one machine, against the production origin. The sign-in limiter allows three requests in ten seconds, so the fourth must answer 429. Run it once without the header and once with it, waiting out the window between runs.

```bash
for attempt in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<domain>/api/auth/sign-in/email -H 'content-type: application/json' -H 'origin: https://<domain>' -d '{"email":"nobody@example.com","password":"wrong-password"}'; done
for attempt in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<domain>/api/auth/sign-in/email -H 'content-type: application/json' -H 'origin: https://<domain>' -H 'X-Forwarded-For: 203.0.113.9' -d '{"email":"nobody@example.com","password":"wrong-password"}'; done
```

Expected in both runs: three 401 then 429. A fourth 401 with the header means the spoofed entry chose the address.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `client-address.test.ts` spoofed leftmost entry | resolved `6.6.6.6`, expected `7.7.7.7` | the last entry is read |
| `client-address.test.ts` two trusted hops | resolved `6.6.6.6`, expected `7.7.7.7` | `at(-2)` |
| `client-address.test.ts` fewer entries than hops | resolved `7.7.7.7`, expected the remote address | `at(-2)` of one entry is absent |
| `environment.test.ts` parses a complete environment | no `trustedProxyHops` field | field defaults to 1 |
| `environment.test.ts` TRUSTED_PROXY_HOPS parse | `undefined` instead of 2 | parsed |
| `environment.test.ts` refuses 0, -1, 1.5, two | did not throw | `InvalidLlmLimitError` names the variable |

## Hypotheses to attack

1. Hypothesis: nothing but better-auth consumes the address. Break it by: grepping for `x-forwarded-for`, `remote.address` and `remoteAddress` outside tests.
2. Hypothesis: Railway appends to `X-Forwarded-For`, so the rightmost entry is the real client. Break it by: the probe above with a chosen header.
3. Hypothesis: the app derives no scheme from `request.url`. Break it by: signing in over the production origin and reading the cookie flags.

## Known gaps

- The real behaviour of Railway's edge is proven only by the post-deploy probe.
- The error class for an invalid hop count is the limit error, whose name mentions the model.
