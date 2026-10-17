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

## G3a: per-tab presence and the members answer time (developer-3a)

### What changed

- `apps/web/src/lib/tab-id.ts`: `tabId()` returns one `crypto.randomUUID()` per page load.
- `libs/types/src/routes.ts`: `TAB_QUERY_KEY = 'tab'` and `isTabId`, a UUID check.
- `apps/web/src/features/editor/collaboration-config.ts`: `collaborationUrl` appends `?tab=<tabId>`. The version viewer shares it, so its socket carries the tab too; `superdoc-options.test.ts` and `version-view-page.test.tsx` expect the new URL.
- `apps/server/src/collaboration/collaboration-server.ts`: the connection context gains `tabId: string | null`, read from `requestParameters` and stored only when `isTabId` accepts it, else `null`.
- `apps/server/src/collaboration/collaboration-runtime.ts`: `onlineTabIds({ documentId, userId })` beside `onlineUserIds`; it counts only that user's connections.
- `apps/server/src/documents/documents-routes.ts`: with a valid `tab` query the members route answers `isCurrentUserOnline` from `onlineTabIds`; without it, the per-user answer.
- `apps/web/src/features/editor/editor-api.ts`: `fetchMembers` sends `tab=<tabId>`.
- `apps/web/src/features/editor/use-members.ts`: return shape is `{ members, isUnavailable, isCurrentUserOnline: boolean | null, membersAnsweredAt: number | null }`. `membersAnsweredAt` is TanStack's `dataUpdatedAt`, `null` before the first answer and after a failed poll.

### Red today, green after

| Test (red, green) | Red text printed | Green when |
|---|---|---|
| `tab-id.test.ts::tabId returns the same id within a page load` (dec8e69, aae89a5) | `Error: tabId is not implemented` | one id per page load |
| `collaboration-config.test.ts::the collaboration URL carries the tab id as the tab query` (50f30ad, 24ebf29) | `AssertionError: expected null to be '<uuid>'` | the URL has `tab` |
| `collaboration-server.test.ts::a connection's tab id is in the room's online tab ids and leaves with the socket` (a742683, 3190979) | `Error: onlineTabIds is not implemented` | the context stores the tab |
| `documents-routes.test.ts::members answers isCurrentUserOnline for the tab that asks, not for another tab of the same user` (7ba3a71, a26d1b8) | `AssertionError: expected true to be false` | the route answers per tab |
| `use-members.test.ts::membersAnsweredAt is null before the first answer and the answer time afterwards` (ca4bccd, cef4b7d) | `AssertionError: expected null not to be null` | `dataUpdatedAt` is exposed |
| `use-members.test.ts::the members request carries the tab id` | `AssertionError: expected null to be '<uuid>'` | `fetchMembers` sends `tab` |
| `use-members.test.ts::membersAnsweredAt is null after a failed poll` | `AssertionError: expected null not to be null`, on the wait before the failed poll | `error` set gives `null` |

| `documents-routes.test.ts::a socket of another user carrying a tab id does not make that tab online for the asking user` (07359ba, e31686d) | `expected [ true, true ] to deeply equal [ false, true ]` | `onlineTabIds` is scoped by user |
| `routes.test.ts::isTabId accepts only a UUID` (27ab715, green after) | `Error: isTabId is not implemented` | UUID pattern |
| `collaboration-server.test.ts::a $name tab query is not stored` | `expected Set{ '' } to deeply equal Set{}` | `onAuthenticate` validates |
| `documents-routes.test.ts::members treats a $name tab as absent and answers per user` | `expected false to be true` | the route validates |

The 16 KB case lives in the `isTabId` unit test; the socket and route tests use 1 KB because Node limits request headers to about 16 KB.

The red commit ca4bccd adds `membersAnsweredAt: null` as a stub so typecheck stays green.

### Hypotheses to attack

1. Hypothesis: with two tabs of one user open, closing or losing the socket of one tab turns only that tab's flag to `false`. Break it by: opening the same document in two tabs, killing one tab's socket, and reading each tab's members answer.
2. Hypothesis: a members request without `tab` keeps the per-user answer for other callers. Break it by: requesting members with no query while any socket of the user is open.
3. Hypothesis: a connection without a `tab` query (agent path, old client) never appears in `onlineTabIds`. Break it by: connecting an agent and reading the members answer for any tab.
4. Hypothesis: user B cannot keep user A's tab online by sending A's tab id. Break it by: connecting as B with `?tab=<A's id>` and asking as A.
5. Hypothesis: a malformed or oversized `tab` never reaches the connection context or the route lookup. Break it by: sending empty, long and non-UUID values on both.
6. Hypothesis: `membersAnsweredAt` advances on every successful poll even when the body is unchanged. Break it by: watching it across two polls with identical members.

### Known gaps

- The lead authorized three one-line edits outside my list: `editor-api.ts`, `superdoc-options.test.ts`, `version-view-page.test.tsx`.
- `document-page.test.tsx` (G3b's file) matches the members path exactly and fails on `?tab=`; reported to the lead, not edited here.
- `onlineTabIds` ignores every tab of a connection that has no `tab` query, so a client that omits it reads `false` when it asks with a tab.

