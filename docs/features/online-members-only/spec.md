# Only online members in the top bar

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner: "nao precisa mostrar avatar de colaboradores offline la na topbar; quem ta sendo mostrado la deve estar online automaticamente")
**Not changing:** the members API and its `online` flag, the share dialog's "People with access" list (it keeps every member), the jump-to-cursor behaviour for online members

## Change

- The top-bar members row (`apps/web/src/features/editor/members.tsx`) renders only members whose `online` flag is true, so an avatar there means "in the document now"; the offline styling (dimmed avatar, offline label) for that row goes away with the offline members. The current user is included when online.
- The overflow count (if the row collapses beyond N avatars) counts online members only.
- When nobody else is online, the row shows only the current user; when the members answer is missing, the existing loading or empty behaviour stays.
- Copy that named offline members in the row's labels is removed from `editor-copy.ts` if nothing else uses it.

## Test list

- `members.test.tsx`: offline members are not rendered; online ones are; the overflow count ignores offline members; the aria label of the row names the online count.
- `e2e/collaboration.spec.ts` or `e2e/connection-state.spec.ts`: Bruno's avatar appears when he opens the document and disappears after he closes his tab (within the members poll).
