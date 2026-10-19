# Client address behind Railway's proxy

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner: "tem trechos do codigo que dizem que rodamos embaixo do traefik ... agora estamos published no Railway... revisa esse codigo e make sure it works with Railway safely")
**ADRs:** [0019](../../adr/0019-deploy-on-railway.md), [0022](../../adr/0022-mechanical-security-gates-and-a-security-reviewer.md)
**Not changing:** the limiters' budgets, better-auth's rate-limit settings, `TRUST_PROXY` as the switch

## Problem

`apps/server/src/http/client-address.ts` trusts the FIRST entry of `X-Forwarded-For` when `TRUST_PROXY=true`, with a note that Traefik overwrites the header. Production runs on Railway, whose edge proxy may append the client's own `X-Forwarded-For` instead of replacing it; then any client chooses its own address and every per-address limit (sign-in, registration, token, open budget, socket admission) is bypassed. Comments, `.env.example` and docs still name Traefik and Dokploy.

## Change

- The trusted address is the entry added by the trusted proxy, counted from the RIGHT: with `TRUSTED_PROXY_HOPS` hops (new optional environment variable, default 1; `TRUST_PROXY=true` required for it to matter), the address is `entries.at(-hops)`; when the header has fewer entries than hops, or is absent, fall back to the socket's remote address. This is correct whether the proxy overwrites or appends. The `NB` note on the function becomes a pointer to the ADR written for this change (`docs/adr/00NN-the-client-address-is-the-rightmost-trusted-hop.md`, template in `docs/adr/_template.md`: alternatives are leftmost-with-overwrite (today), a CIDR allow-list of proxy addresses, and the rightmost-hop count; pick the hop count).
- Every consumer of the address keeps reading `CLIENT_ADDRESS_HEADER`; audit that nothing reads `x-forwarded-for` directly (`attach-collaboration.ts`, limiters, better-auth `ipAddressHeaders`) and that the WebSocket upgrade path resolves the address the same way.
- `X-Forwarded-Proto`: check whether anything derives the scheme from the request (cookie `secure`, OAuth redirect validation, `APP_ORIGIN` comparison); production terminates TLS at Railway's edge, so the app must not require `request.url` to be https. Record the finding in this spec.
- Docs: `.env.example` (production values live in Railway, not Dokploy; the TRUST_PROXY note names "a reverse proxy that sets X-Forwarded-For (Railway)"), `docs/install.md` table, `docs/features/deploy/runbook-railway.md` adds `TRUSTED_PROXY_HOPS` (unset = 1), `.claude/rules/*` facts that name Traefik, `docker/docker-compose.yml` comment-free but its env stays.
- A probe for after the deploy, kept in the lane's briefing as a command (never committed as code): with `curl` and a spoofed `X-Forwarded-For: 203.0.113.9`, repeated sign-in failures from one machine must still hit the limiter's 429 at the same count as without the header.

### Failure handling

| Case | Behaviour |
|------|-----------|
| `TRUSTED_PROXY_HOPS` not a positive integer | the server refuses to start naming the variable (existing `environment.ts` pattern) |
| Fewer entries than hops | the socket remote address |
| `TRUST_PROXY=false` | the socket remote address, header ignored (unchanged) |

## Test strategy summary

Unit (`client-address.test.ts`): rightmost with one hop; a spoofed leftmost entry is ignored; two hops; fewer entries than hops; absent header; trustProxy false. Route-level: a limiter keyed on the address sees the proxy-added entry, not the spoofed one (extend an existing limiter test with a two-entry header). Environment parsing tests for the new variable.
