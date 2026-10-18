# Tester briefing: Sign-out commits the sign-in route before the session flips

Written by developer-sm. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/web/src/features/auth/use-sign-out.ts`: the navigation passes `flushSync: true`.
- `apps/web/src/main.tsx`, `apps/web/src/testing/render-with-providers.tsx`, `sign-out-flow.test.tsx`: `RouterProvider` comes from `react-router/dom`.
- `sign-out-menu-item.test.tsx`: the options pin includes `flushSync: true`; the order pin is renamed.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit src/features/auth/sign-out-flow.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `sign-out-flow.test.tsx::a sign-in route that renders slowly still ends on the bare sign-in route`, 8efe42b6 | `expected [ '', '?next=%2Fdocuments' ] to not include '?next=%2Fdocuments'` | 7f798e83 |

## Hypotheses to attack

1. Hypothesis: with the sign-in route rendering for 0, 5, 30 and 120 ms, no location with `next` is visited. Break it by editing the busy constant.
2. Hypothesis: `RequireAdmin` is closed by the same change. Break it by signing out from an admin page under throttle.
3. Hypothesis: the dom `RouterProvider` changes nothing else in the app.

## Known gaps

- Other test files still import `RouterProvider` from `react-router`; they do not sign out.
