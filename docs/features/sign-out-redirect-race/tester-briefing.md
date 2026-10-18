# Tester briefing: Sign-out leaves the page before it clears the session

Written by developer-sm. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/web/src/features/auth/use-sign-out.ts`: after the auth client signs out it navigates to the bare sign-in route first, then sets the cached session to `null` and invalidates it.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/auth/sign-out-flow.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `sign-out-flow.test.tsx::signing out leaves the page before the cached session flips ...`, e79cf460 | `expected [ null ] to deeply equal [ { id: 'user-1', ... } ]` | 8ebb82ed |

## Hypotheses to attack

1. Hypothesis: no `?next=` appears in the URL or the history while signing out. Break it by: signing out from a document page and from the documents list, then pressing Back.
2. Hypothesis: the old user never shows after sign-out. Break it by: watching the account menu during the transition.
3. Hypothesis: sign-out still fails closed. Break it by: blocking the sign-out request.

## Known gaps

- The race itself depends on timing; the unit test pins the order, not the URL.
