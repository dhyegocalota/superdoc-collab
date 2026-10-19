# Tester briefing: Revoke a person's access

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `libs/types/src/constants.ts`, `documents.ts`, `routes.ts` — `ACCESS_REVOKED_CLOSE_CODE` (4404), `ACCESS_REVOKED_REASON`, the two route messages, `memberApiPath`.
- `apps/server/src/documents/documents-repository.ts` — `revoke` deletes one member row.
- `apps/server/src/collaboration/collaboration-runtime.ts` — `closeUserConnections` closes that user's connections in every room of the document with 4404 and logs the document id only.
- `apps/server/src/documents/documents-routes.ts` — `DELETE /:documentId/members/:userId`, owner only: unknown member 404, owner 400, otherwise delete the row, then close the sockets, then 204.
- `apps/web/src/features/editor/people-with-access.tsx` (new), `share-dialog.tsx`, `editor-api.ts` (`revokeMember`), `editor-copy.ts` — the "People with access" group in the share dialog; success invalidates the members query key, failure shows `REMOVE_FAILED_MESSAGE`. Role labels reuse `ROLE_LABELS` of the documents feature.
- `.claude/rules/collaboration.md` — one bullet.
- `e2e/revoke-access.spec.ts` — Ana removes Bruno.

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/documents/member-removal-routes.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/documents/documents-repository.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/collaboration-runtime.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/share-dialog.test.tsx
pnpm test:e2e e2e/revoke-access.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `documents-repository.test.ts::revoke removes one member and keeps the others` (d41146f0) | `Error: revoke is not implemented` | the row is deleted by user and document |
| `collaboration-runtime.test.ts::closeUserConnections closes only that user's sockets…` (d41146f0) | `Error: closeUserConnections is not implemented` | filtered by `userId` of the connection context |
| `member-removal-routes.test.ts::owner removes a reader` (red as `documents-routes.test.ts`, d41146f0) | `expected 404 to be 204` | the route exists |
| `member-removal-routes.test.ts::removing a member closes that member socket with 4404…` | `expected null to deeply equal { code: 4404, … }` (poll timed out) | `closeUserConnections` runs after the delete |
| `member-removal-routes.test.ts::owner cannot remove themself` | `expected [ 404, { error: 'Not found' } ] to deeply equal [ 400, … ]` | the owner role is refused |
| `member-removal-routes.test.ts::unknown member answers 404` | the 404 body was the guard's `Not found`, not `MEMBER_NOT_FOUND_MESSAGE` | the route answers its own message |
| `member-removal-routes.test.ts::an editor cannot remove anyone`, `::a stranger removing a member…` | pins: green when they landed (the guard already refuses) | unchanged |
| `share-dialog.test.tsx` three new tests (17725e44) | `Unable to find role="group" and name "People with access"` | the section renders |
| `e2e/revoke-access.spec.ts` | not run red (written after the unit layer) | passed once alone, 5.0 s |

## Hypotheses to attack

1. Hypothesis: only the owner can remove. Break it by calling the route as an editor (expect 403), a reader (403) and a stranger (404), and as the owner for the owner id (400).
2. Hypothesis: the removed person's open socket closes with 4404 and a reconnect is refused. Break it by keeping Bruno's tab open, removing him, and watching the console and network for the reconnect loop and the 404 members poll.
3. Hypothesis: the row is deleted before the sockets close. Break it by removing Bruno while he types, then re-reading the members list.
4. Hypothesis: the dialog list and the header avatars share data. Break it by removing someone and checking the avatars shrink without waiting for the 5 second poll.
5. Hypothesis: a failed removal keeps the row and shows the message. Break it by going offline in devtools and clicking Remove.
6. Hypothesis: the dialog fits 375 px. Break it with a long member name.

## Known gaps

- The spec and the lead's prompt say a non-owner gets 404 from the guard. The existing guard answers 403 to a member below the required role and 404 only to a non-member; the tests pin that. The spec wording should say 403 for an editor or reader.
- The route tests live in `member-removal-routes.test.ts`, not `documents-routes.test.ts`: the auth rate limit (100 requests per 10 seconds per process) is exhausted by the sign-ups of that file and later tests got 429.
- A failed member list fetch hides the "People with access" group silently; there is no loading skeleton or error line for it.
- Agent sockets of a removed user are closed by the same call but not exercised end to end.
- The spec files of this folder were copied from commit 2800c33b of `chore/feature-status-gate` because the lane was cut before that commit; `plan.md` and `test-plan.md` here are edited, so merging that branch will conflict on this folder and should keep this lane's version.
- `docs/features/README.md` status row was not touched.
