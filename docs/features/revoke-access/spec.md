# Revoke a person's access

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner: "remove an existing read-only or edit permissions of people")
**ADRs:** none new; builds on the share-link model of documents-and-history
**Not changing:** share links and their rotation, the agent tools, the role ranks

## Problem

A person who accepted a read or edit link keeps the role for ever. The owner has no way to remove them.

## Goals

1. The owner removes any member except themself from the share dialog.
2. The removed person loses access at once: their sockets in the document's rooms close, their next members poll answers 404 and the editor shows the existing unavailable state, and the document leaves their list.
3. The owner's members avatars and the dialog update without a reload (`invalidateQueries` on the members key).

## Non-goals

- Changing a member's role in place (remove and re-share instead).
- Blocking the person from accepting the same link again; the owner resets the link for that.

## Design

### Interfaces

- `DELETE /api/documents/:documentId/members/:userId` (`documents-routes.ts`, `mountManagement`), `authorizedDocumentId` with `DocumentRole.Owner`.
  - `:userId` is the owner → 400 `{ error: OWNER_ACCESS_CANNOT_BE_REMOVED_MESSAGE }`.
  - `:userId` is not a member → 404 `{ error: MEMBER_NOT_FOUND_MESSAGE }`.
  - Otherwise `documents.revoke({ documentId, userId })` deletes the row, `runtime.closeUserConnections({ documentId, userId })` closes that user's connections in every room of the document with `ACCESS_REVOKED_CLOSE_CODE` (4404) and `ACCESS_REVOKED_REASON`, and the route answers 204.
- `DocumentsRepository.revoke` and `DocumentRuntime.closeUserConnections` are new; both constants live in `libs/types/src/constants.ts`, the messages in `libs/types/src/documents.ts`, and `memberApiPath({ documentId, userId })` in `libs/types/src/routes.ts`.
- Web: `revokeMember({ documentId, userId })` in `editor-api.ts`; the share dialog gets a "People with access" section listing the members query (`fetchMembers`, enabled while open) as name, role label and a `Remove` button (`aria-label` `Remove <name>`) on every member but the owner; success invalidates `membersQueryKey(documentId)`; failure shows `REMOVE_FAILED_MESSAGE`. Copy in `editor-copy.ts`.

### Failure handling

| Case | Behaviour |
|------|-----------|
| Request by a non-owner | 404 through the existing role guard (enumeration-safe) |
| Removed user reconnects | `onAuthenticate` finds no role and refuses; the provider stops |
| Removed user is mid-edit | socket closed with 4404; unsynced keystrokes are lost, which the unavailable state states |
| Remove fails (network) | the row stays, `REMOVE_FAILED_MESSAGE` under the list |

## Test strategy summary

Unit: repository `revoke` (row gone, other members intact), route (owner 204, owner-self 400, unknown 404, editor 404), runtime `closeUserConnections` closes only that user's connections. Web unit: the dialog lists members, hides Remove on the owner, calls the API and invalidates. E2E: Ana shares with Bruno, removes him; Bruno's page shows the unavailable state, his list drops the document, Ana's avatars shrink.
