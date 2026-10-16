# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## Task 7: web app scaffold, design tokens and auth flow

**Changed:** new `apps/web` (Vite + React + Tailwind + shadcn). Auth pages in `apps/web/src/features/auth/`, `documents-page.tsx` in `apps/web/src/routes/`, tokens in `apps/web/src/styles/globals.css`.

**Run:** `pnpm dev` (server on 3000, web on Vite with `/api` and `/collaboration` proxied); `pnpm --filter @superdoc-history/web build` writes `apps/web/dist`. Unit: `pnpm --filter @superdoc-history/web test:unit`.

**Red before, green after:** `safe-next-path.test.ts` (6 cases), `sign-in-page.test.tsx` (3 cases).

**Hypotheses for the tester:**
- `/documents` without a session redirects to `/sign-in?next=%2Fdocuments`; after sign-in the user lands on `next`; `next=//evil.example` lands on `/documents`.
- A wrong password shows exactly "Invalid email or password." on the form, never a specific reason.
- After the rate limit trips, the form shows "Too many attempts. Try again in N seconds." using `X-Retry-After`.
- Sign-out returns to `/sign-in` and `/documents` redirects again.
- Reload on `/documents` keeps the session (cookie, `GET /api/me`).

**Gaps:** no unit test for sign-up, the 429 message or sign-out; dark mode tokens exist but nothing toggles `.dark`; the production bundle is one 580 kB chunk.
