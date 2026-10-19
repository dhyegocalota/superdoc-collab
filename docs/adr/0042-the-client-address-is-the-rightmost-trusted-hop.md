# 0042. The client address is the rightmost trusted hop

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0019](0019-deploy-on-railway.md) (production runs behind Railway's edge proxy), [0022](0022-mechanical-security-gates-and-a-security-reviewer.md), `docs/features/proxy-address-on-railway/spec.md`

## Context

Every per-address limit (sign-in, registration, token, better-auth's rate limit) keys on the address `withClientAddress` resolves. The resolver took the first entry of `X-Forwarded-For` when `TRUST_PROXY=true`, on the premise that the proxy overwrites the header. That premise held for Traefik (ADR 0013) and is not guaranteed for Railway's edge, which may append the address it saw to whatever the client sent. With an appending proxy, the first entry is chosen by the client, so any client rotates its address per request and no per-address limit holds.

## Decision

- With `TRUST_PROXY=true`, the client address is the entry the trusted proxy added, counted from the right: `entries.at(-hops)`, where `hops` is `TRUSTED_PROXY_HOPS` (optional positive integer, default 1).
- A header with fewer entries than `hops`, or no header, resolves to the socket's remote address. With `TRUST_PROXY=false` the header is ignored.
- This is correct whether the proxy overwrites or appends: entries to the left of the trusted ones are never read.
- Every consumer keeps reading `x-client-ip`, which the resolver always overwrites; nothing reads `x-forwarded-for` directly.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Leftmost entry, trusting the proxy to overwrite (before) | simplest | the client chooses the address when the proxy appends; limits bypassed | unsafe on Railway |
| Allow-list of proxy addresses (CIDR), skip trusted entries from the right | exact when the proxy range is known | Railway publishes no stable proxy range; a stale list silently trusts or distrusts the wrong hop | cannot be kept true |
| Rightmost entry counted by hops | safe for overwrite and append; one integer; no address list | a wrong hop count resolves the proxy's neighbour address instead of the client's | chosen |

## Consequences

- Behind one proxy nothing changes for real clients; a spoofed leftmost entry is ignored.
- Adding a second proxy in front (a CDN) requires `TRUSTED_PROXY_HOPS=2`; forgetting it rate-limits the CDN's address as one client, which fails closed on abuse and noisy on users.
- `TRUST_PROXY=true` is still unsafe when the app port is reachable without the proxy.
- Integration tests keep sending one `X-Forwarded-For` entry, which is the rightmost one.

## Evidence

- `apps/server/src/http/client-address.test.ts` and `apps/server/src/config/environment.test.ts`.
- The limiter route test in `apps/server/src/http/app.test.ts` sends a two-entry header and shows the spoofed entry does not change the limited address.

## Revisit when

Railway documents that its edge overwrites `X-Forwarded-For` and publishes a stable proxy range, or the deploy gains a second proxy.
