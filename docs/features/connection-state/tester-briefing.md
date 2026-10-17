# Tester briefing: connection state

Written by the developer sub-agents when their steps are done. The developers do not run `test-plan.md` and do not declare the feature works.

## G1: types and the members flag (developer-1)

### What changed

- `libs/types/src/connection.ts`: `ConnectionState` and `ConnectionFailureReason` enums, exported from `index.ts`.
- `libs/types/src/constants.ts`: `RECOVERED_NOTICE_MS` (3 s).
- `libs/types/src/documents.ts`: `DocumentMembers` gains `isCurrentUserOnline: boolean`.
- `apps/server/src/documents/documents-routes.ts`: the members route answers `isCurrentUserOnline` for the caller from `runtime.onlineUserIds`.
- `apps/web/src/features/editor/use-members.ts`: returns `isCurrentUserOnline: boolean | null`, `null` without data or with a poll error.
- `.claude/rules/collaboration.md`: one line on the members flag.
- No web test fixture needed a change for the new field.

### How to run

```bash
pnpm --filter @superdoc-collab/types test:unit -- connection
pnpm --filter @superdoc-collab/server test:unit -- documents-routes
pnpm --filter @superdoc-collab/web test:unit -- use-members
pnpm typecheck
```

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types/src/connection.test.ts::the connection states are the five values the banner names` (red 3346bdb, green b348737) | `Cannot find module './connection' imported from .../connection.test.ts` | the enum exists with five values |
| `apps/server/src/documents/documents-routes.test.ts::members reports whether the current user is online` (red 30896c7, green 9ba8514) | `AssertionError: expected [ undefined, undefined ] to deeply equal [ true, false ]` | the route adds the caller's flag |
| `apps/web/src/features/editor/use-members.test.ts::isCurrentUserOnline is null before the first answer` (red da3b144, green 1f86eff) | `AssertionError: expected undefined to be null` | the hook returns `null` without data |
| `use-members.test.ts::isCurrentUserOnline follows the latest answer` | `AssertionError: expected undefined to be true` | the hook returns the data flag |
| `use-members.test.ts::isCurrentUserOnline is null after a failed poll` | `AssertionError: expected undefined to be true`, on the first wait, before the 500 | `error` set gives `null` |

The red commit da3b144 leaves the web typecheck red: no stub, because the hook has no such field yet.

### Hypotheses to attack

1. Hypothesis: the flag reflects the server's socket for the caller, not the browser's belief. Break it by: restarting the server while a user is connected and reading the members response before the socket returns.
2. Hypothesis: a reader with no collaboration socket gets `false`, never a missing field. Break it by: requesting members as that reader.
3. Hypothesis: after a failed poll the hook never reports a stale `true`. Break it by: making the members endpoint fail once while connected and watching the value go `null` until the next good answer.
4. Hypothesis: the `final-visuals` lane's edits to `use-members.ts` merge cleanly because fields were only added. Break it by: merging both lanes and running the web unit tests.

### Known gaps

- The failed-poll test drives the refetch with `invalidateQueries`, not the 5 s interval, so the polling cadence is not covered here.
- Any members poll error yields `null`, including the unavailable case; `isUnavailable` is unchanged.
