# Tester briefing: The session query is fresh for five minutes

Written by developer-sm. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `libs/types/src/constants.ts`: `SESSION_STALE_TIME_MS`, five minutes.
- `apps/web/src/features/auth/use-session.ts`: the session query uses that stale time and refetches on window focus and on reconnect even inside it.
- `apps/web/src/features/auth/use-sign-out.ts`: after signing out it sets the cached session to `null` and invalidates it, then navigates to sign-in.

## How to run

```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/auth/use-session.test.tsx src/features/auth/sign-out-flow.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `use-session.test.tsx::the session stays fresh for five minutes`, 2cdc513 | `expected +0 to be 300000` | 57bb86c |
| `use-session.test.tsx::two consumers mounted one after the other ask the server once` | `expected 2 to be 1` | 57bb86c |
| `use-session.test.tsx::a window focus asks the server again ...`, `::coming back online asks the server again ...`, e09bc08 | `expected 1 to be 2` | 6d880ed |
| `use-session.test.tsx::a failed refetch keeps the last good user ...` | pin | pin |
| `sign-out-flow.test.tsx::signing out sets the session to signed out and invalidates it`, b1fe992 | `expected { id: 'user-1', ... } to be null` | 30affcf |

## Hypotheses to attack

1. Hypothesis: nothing in the app relied on a refetch at mount to learn the session changed. Break it by: changing the time zone, signing in as another user in the same tab, accepting an invite.
2. Hypothesis: after sign-out no page shows the old user. Break it by: Back, a second tab, the documents list.
3. Hypothesis: a session that ends on the server while the socket is alive is noticed on window focus, on the next session refetch (stale time, sign-in, time zone save, reload) or when the transport drops, not by the members poll. Break it by: removing the cookie, switching tabs and back; reloading.
4. Hypothesis: resizing across 1024 px causes no `/api/me` request. Break it by: watching the network tab while resizing.

## Known gaps

- The five-minute window is not waited out in any test.
- A session that ends on the server with a live socket is noticed on focus, reload or a transport drop, not by the members poll (ADR 0032).
- For the owner: a sign-out in another tab leaves an open editor writable as the old user until a focus or five minutes (the server never closes sockets on sign-out; the root fix is a server-side lane). Option B, a members 401 invalidating the session, would redirect mid-edit.
