# Plan: Client address behind Railway's proxy

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `apps/server/src/http/client-address.ts`

## Steps

- [x] **Step 1:** ADR 0042 and its index row.
- [x] **Step 2:** red tests for the rightmost hop and `TRUSTED_PROXY_HOPS` (`client-address.test.ts`, `environment.test.ts`), committed alone.
- [x] **Step 3:** green: `withClientAddress` counts from the right, `loadEnvironment` parses `TRUSTED_PROXY_HOPS`, `app.ts` and the test server pass it.
- [x] **Step 4:** audit every consumer of the address and extend one limiter route test with a two-entry header.
- [x] **Step 5:** record the `X-Forwarded-Proto` finding in the spec.
- [x] **Step 6:** docs: `.env.example`, `docs/install.md`, `runbook-railway.md`.
- [x] **Step 7:** `pnpm typecheck` clean; `pnpm verify` is the lead's.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 3 | A hop count above the real number of proxies resolves the socket address, so every visitor shares one limit | the post-deploy probe hits 429 for a second machine at once | unset `TRUSTED_PROXY_HOPS` |
| 3 | A hop count below the real number resolves a proxy address | same probe | set `TRUSTED_PROXY_HOPS` to the real count |

**Steps with no backout:** none.
