# 0010. Documents: owner, two share links, files on the data volume

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the take-home brief (`docs/brief/`: real auth and permissions out of scope, DOCX under 10 MB), [0005](0005-authentication-with-better-auth.md), [0008](0008-vertical-slices.md)

## Context

Slice 2 introduces documents. Three product questions had to be settled before the spec: how a document enters the system, who can see it, and where its bytes live. The demo is several people editing one document while the timeline shows who did what, so sharing must be effortless, and the reviewer lens demands per-document authorization rather than "any signed-in user sees everything".

## Decision

- A document enters by **uploading a `.docx` (10 MB limit)** or by **creating a blank document** in SuperDoc. Both paths create the same record and the same collaboration room.
- Every document has an **owner**. The owner holds two **share links**, one granting **edit** and one granting **read-only** access to any signed-in user who opens it; the owner can rotate either link. Read-only members join the Hocuspocus room with `connection.readOnly = true` and the editor shows a read-only badge.
- Membership is recorded when a link is first opened, so the documents list shows "mine" and "shared with me", and the timeline can name every contributor.
- The uploaded `.docx` (and any later export) is stored **on disk under `DATABASE_DIR/documents/<documentId>.docx`**, inside the same volume as the SQLite files. Metadata lives in SQLite.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Single workspace: everyone signed in sees everything | No sharing UI at all | No per-document authorization; unrealistic | The reviewer lens and the "shared with me" story need real membership |
| Owner invites members by email | Most realistic | Invite UI, member table, one more flow to demo | Links give the same authorization with less ceremony |
| One link that always edits | One token, one screen | No reader role, although the product is about *viewing* evolution | Read-only is a real role here |
| One link with an owner-chosen role | Fewer tokens | Role lives on the document, not on the link; switching it changes what existing holders can do | Two explicit links are easier to reason about |
| DOCX as a SQLite blob | One file, atomic | Blobs of up to 10 MB bloat the database and its WAL | Disk is the right tool |
| Discard the original after import | Less storage | Loses the original for audit and re-import | Keep it; it is small |

## Consequences

- Tables: `documents` (id, title, ownerId, fileName, createdAt), `document_members` (documentId, userId, role, joinedAt), `document_share_links` (documentId, role, token, rotatedAt). Enum `DocumentRole { Owner, Editor, Reader }`.
- Every document route, the upload, the file download, the history endpoints and the Hocuspocus `onAuthenticate` check membership; readers get `readOnly`.
- Share tokens are random (32 bytes), stored hashed, and never appear in logs.
- File storage sits behind an interface (owner decision, dependency inversion): `DocumentFileStorage { put({ documentId, bytes }), get(documentId), delete(documentId) }` in `libs/history` (or `apps/server/src/storage`), with `LocalDiskDocumentFileStorage` as the only adapter in this slice. Services depend on the interface; the adapter is chosen at composition time, so an object store adapter later touches one file and no call site.
- `DATABASE_DIR/documents` is created at boot like the database directory; the 10 MB limit is enforced before the body is read into memory.

## Evidence

Owner decisions on 2026-10-16 (entry paths "ambos", visibility "dono + link de compartilhamento", two links, disk storage).

## Revisit when

Email invitations or organisations become a requirement, or documents outgrow a single volume.
