# Tester briefing: Sign-in keeps the next path

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/web/src/features/auth/redirect-if-session.tsx` — a signed-in user is sent to `safeNextPath(searchParams.get('next'))` instead of `/documents`.
- `apps/web/src/features/auth/redirect-if-session.test.tsx` — two cases: `next` honoured, foreign origin ignored.
- `e2e/auth.spec.ts` — `a signed-out member who opens a share link lands on the document after signing in`.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit -- src/features/auth
pnpm test:e2e e2e/auth.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `redirect-if-session.test.tsx::redirects a signed-in user to the next path it was sent from` | the wrapper navigated to documents (`Unable to find an element with the text: share landing`) | it navigates to the safe next path |
| `e2e/auth.spec.ts::a signed-out member who opens a share link lands on the document after signing in` | the URL after sign-in was `/documents` | the URL is `/documents/<id>` |
| `redirect-if-session.test.tsx::ignores a next path on another origin` | pin | `safeNextPath` keeps the origin check |

Red commit: `03cc665` (unit); the E2E was added with the fix because it needs the built app, and its red run is recorded in the test plan by the lead.

## Hypotheses to attack

1. Hypothesis: `?next=/sign-in` cannot loop. Break it by: signed in, open `/sign-in?next=%2Fsign-in`.
2. Hypothesis: the submit's `navigate(next)` and the wrapper's `Navigate` never disagree. Break it by: reading both; both call `safeNextPath` on the same search param.
3. Hypothesis: sign-up with `next` lands on `next` too (same wrapper). Break it by: a sign-up with an invite is not possible on a claimed instance, so reason from the code.

## Known gaps

- Nothing else.
