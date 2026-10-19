# Plan: Revoke a person's access

**Spec:** spec.md
**Tier:** 🟡
**Seam:** `documents-routes.ts` → `DocumentsRepository` + `DocumentRuntime`; `share-dialog.tsx` → `editor-api.ts`

## Steps

- [x] **Step 1 (red):** `documents-repository.test.ts` revoke; `documents-routes.test.ts` the four route cases; `collaboration-runtime` test for `closeUserConnections`; commit red alone. Evidence: d41146f0.
- [x] **Step 2 (green):** constants, messages and path helper in `libs/types`; repository `revoke`; runtime `closeUserConnections`; the route. Evidence: b82040da. The constants, messages, path helper and two throwing stubs landed in the red commit so typecheck stays green; the route tests moved to `member-removal-routes.test.ts` because the auth rate limit (100 requests per 10 s per process) is spent by the sign-ups of `documents-routes.test.ts`.
- [x] **Step 3 (red):** `share-dialog.test.tsx` lists members, no Remove on the owner, Remove calls `revokeMember` and invalidates members; commit red alone. Evidence: 17725e44.
- [x] **Step 4 (green):** `revokeMember` in `editor-api.ts`, the "People with access" section, copy. Evidence: 0c20ee58.
- [ ] **Step 5:** E2E in a new `e2e/revoke-access.spec.ts` (two contexts, Ana removes Bruno); run that file alone.
- [x] **Step 6:** `.claude/rules/collaboration.md` gains the 4404 close fact; tester briefing. Evidence: the docs commit of this lane.

## Failure modes

| Step | What breaks | How I notice | How I back out |
|------|-------------|--------------|----------------|
| 2 | Hocuspocus reconnects the closed socket before the row is gone | the runtime test sees a second connection for the user | delete the row before closing the sockets |
| 4 | The members query is shared with the header; enabling it in the dialog changes the poll | `use-members` tests change | read the header's members from the same query key without a second fetcher |
