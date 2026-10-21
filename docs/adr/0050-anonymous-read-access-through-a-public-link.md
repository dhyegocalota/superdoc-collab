# 0050. Anonymous read access through a public link

- Status: Accepted
- Date: 2026-10-21
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0010](0010-documents-ownership-and-share-links.md), [0017](0017-share-links-reissued-when-the-secret-changes.md), [0025](0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md), [0041](0041-the-summary-card-shows-the-sentence-as-it-is-written.md), [0044](0044-version-builds-are-budgeted-per-user-and-capped-in-the-projection-queue.md)

## Context

Every route and every socket requires a session and a membership ([0010](0010-documents-ownership-and-share-links.md)). The owner asked for a way to show a document to someone with no account: "support a public flag for read-only; but nobody public can do anything in the doc, like asking summarize edits; simply use the latest summarize edits available", and then "I want the Google Docs look-and-feel" for presence.

A public reader is the first caller with no user row. Three things in the code base assume one: `onAuthenticate` resolves a role from `document_members`, `isWriteAllowed` does not look at the role (it relies on `connection.readOnly`), and the history routes build projections and call the model on a GET (`topics.ensure()`).

## Decision

- A document has a flag `is_public`, off by default, switched only by its owner. While it is on, anyone with the link `/public/<documentId>` reads the document live, read-only. The document id is a random UUID (`randomUUID`, 122 bits), so the id is the unguessable slug and no second secret is added; the id grants nothing while the flag is off or to a caller who holds no room token.
- The public surface is a GET allowlist under `/api/public/:documentId`: the document's metadata, the sanitized members, the latest stored summary. Nothing that builds a projection, a version or a model call is reachable: the public routes never call `topics.ensure()`, the timeline, the versions, the events, the download, the comments or Summarize, and those routes keep their session guard.
- The live document is a separate socket path, `/collaboration/public`, with no session cookie. A public GET mints a short-lived signed public room token (the pattern of [0025](0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md), its own key label so it cannot be replayed as an agent or bootstrap token). The socket is admitted with it, `connection.readOnly = true`, never a member row, and `onChange` refuses to log an update whose context is a visitor, so a bug in the read-only flag cannot reach the update log.
- Identity is Google's link sharing: an anonymous visitor gets a server-issued identity per visit, `Anonymous <Animal>`, with a colour slot from the author palette; a signed-in non-member keeps their real name. Presence is two-way: members see visitors in the members row, visitors see the online people and the editors' live cursors; visitors have no caret of their own and the server sends no email in its own answers or awareness (comments, tracked changes and authors saved in the document travel with the document: see Consequences).
- The summary shown to visitors is the most recently stored selection summary of the document. A visitor can never start one.
- Public GETs and public socket admissions are limited per client address with the sliding window helper; turning the flag off closes every open public socket and the next admission re-reads the flag.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| A. Invisible and blind (Google "Publish to the web"): a static snapshot, no live room, no presence | Smallest surface; nothing live to attack | Not live; the owner asked for the Google look-and-feel | The owner chose C |
| B. Anonymous counter: live text, a "3 viewers" count, no names | Little to leak | Presence is the product; a count shows nobody | The owner chose C |
| C. Google link sharing: live, anonymous animals, visitors see presence | The behaviour people already know | Names of the people editing are visible to anyone with the link | Chosen on 2026-10-21 |
| A third share-link role (`public`) beside edit and read | Reuses the rotation machinery | A share link grants membership and needs a session; the public reader has neither | The anonymous caller cannot hold a member row |

## Consequences

- The names of the people editing a public document are visible to anyone holding the link. The owner is told next to the switch.
- `documents` gains `is_public` (migration 0009); the socket server gains a fourth kind of socket beside member, agent and bootstrap.
- A public reader loads the room like a member does, so the heavy room admission and the per-client-address windows apply to it; the room is charged to the visitor identity, which holds no per-user quota.
- Residual risk: the document itself is what a visitor syncs, so comments, tracked changes and authors imported with a DOCX, and any email SuperDoc stamped into them before this change, stay readable to anyone with the link. New comments and tracked changes carry none, because the browser no longer hands SuperDoc the email. The Share dialog says so next to the switch.
- Rollback: switching the flag off is the kill switch for one document; reverting the migration loses only the flag.

## Evidence

Owner decisions on 2026-10-21: the public flag, the read-only rule, the latest summary, option C.

## Revisit when

A public document needs comments from visitors, a download, or a per-link expiry, or when a hosted deployment puts a cache in front of `/api/public`.
