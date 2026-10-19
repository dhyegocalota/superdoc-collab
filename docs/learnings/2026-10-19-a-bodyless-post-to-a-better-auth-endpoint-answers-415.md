# A bodyless POST to a better-auth endpoint answers 415 and the button looks dead
- Date: 2026-10-19
- Inspired by: [ADR 0046](../adr/0046-archiving-is-a-ban-plus-full-access-revocation-impersonation-is-a-visible-session.md), the first run of `e2e/admin-archive-impersonate.spec.ts`
- Revisited: 2026-10-19 — still true

## Signal

Stop impersonating shows its failure message in the browser while a server test that sends a JSON body passes.

## Cause

better-auth's router refuses a POST with no JSON content type, even for an endpoint that reads no body. `apiSend` sets the header only when the body is a string, so `body: null` sends none.

## Do

Send `'{}'` from `apiSend` to any better-auth endpoint, and keep a server test that omits the header so the 415 stays documented.

## Anchor

`apps/web/src/features/impersonation/impersonation-api.ts`, `apps/server/src/admin/user-access-routes.test.ts` (a stop without a JSON content type), `apps/web/src/features/impersonation/impersonation-banner.test.tsx`
