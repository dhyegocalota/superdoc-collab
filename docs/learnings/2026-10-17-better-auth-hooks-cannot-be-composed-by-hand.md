# Better Auth hooks cannot be composed by hand; add a plugin with matcher hooks

- Date: 2026-10-17
- Inspired by: the invite-only plan review (`docs/features/invite-only-access/plan.md`, Task 4): a helper that chained `normalizeCredentials` with a sign-up gate inside `hooks.before`/`hooks.after` was probed against Better Auth 1.7.10
- Revisited: 2026-10-17 — `apps/server/src/auth/sign-up-gate.ts` is a local plugin; the user hooks in `auth.ts` stayed as they were

## Signal
Every auth endpoint answers `200 {"headers":{}}` and runs nothing, or an `APIError` thrown in an after hook becomes an unhandled rejection and the request still succeeds.

## Cause
Better Auth calls each hook with `returnHeaders: true`, so every middleware returns a `{ headers, response }` wrapper, never `undefined`. A hand-written sequence treats that wrapper as a short-circuit and never awaits the next middleware's rejection.

## Do
Keep `hooks.before` and `hooks.after` to one middleware each and add further behaviour as a plugin: `{ id, hooks: { before: [{ matcher, handler }], after: [{ matcher, handler }] } }`. Order is user before, plugin before, handler, user after, plugin after; a plugin after hook sees the user hook's already-transformed `returned`, and `context.headers` carries the request headers both over HTTP and through `auth.api.*({ headers })`.

## Anchor
`apps/server/src/auth/sign-up-gate.ts`, `apps/server/src/auth/auth.ts`, `apps/server/src/auth/sign-up-gate.test.ts`
