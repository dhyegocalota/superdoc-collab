# Where it goes next

What is not decided yet, and where the app goes when it is. [Architecture](architecture.md) holds what is true today and the [decisions](adr/) hold why. An item here becomes a folder in [features](features/README.md) when it is approved, and leaves this page in the same change.

## Scale

Each step names the signal that calls for it and the decision it revisits. The order is the order the signals are expected to arrive.

| Signal | Change | Revisits |
|--------|--------|----------|
| A second instance, or data past one volume | Postgres for auth, history and the read model; Drizzle already owns their schemas and migrations | [0004](adr/0004-stack.md), [0007](adr/0007-read-model-in-sqlite.md), [0019](adr/0019-deploy-on-railway.md) |
| More rooms than one process holds | Route each document to one owning instance by its id, so its update log keeps a single ordered writer; share a room across instances through Redis only if one document outgrows a process | [0001](adr/0001-event-sourcing-over-yjs.md), [0003](adr/0003-time-travel-with-native-yjs-snapshots.md) |
| The same, for the limits | The model caps, summary cooldowns, socket budgets, creator reservations and partial summaries move from process memory to Redis | [0012](adr/0012-selection-summaries-cached-per-filter-and-cursor.md), [0033](adr/0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md), [0041](adr/0041-the-summary-card-shows-the-sentence-as-it-is-written.md) |
| Projection lag visible in the panel | The projection worker thread becomes a queue of jobs keyed by document, which keeps per-document order and spreads documents across machines | [0007](adr/0007-read-model-in-sqlite.md), [0018](adr/0018-fan-out-ci-and-prebuild-the-projection-worker.md) |
| Files past one volume | Object storage behind the existing file storage type; its local path accessor is the one disk assumption to remove first | [0010](adr/0010-documents-ownership-and-share-links.md), [0013](adr/0013-deploy-with-dokploy-compose.md) |
| A document's update log too large for its volume | Compaction already writes a snapshot every thousand updates and keeps every update; move the updates below an old snapshot to cold storage, read back only to rebuild a version older than it | [0003](adr/0003-time-travel-with-native-yjs-snapshots.md) |
| Histories too long for the chart's render budget | The streamgraph moves to canvas | [0016](adr/0016-timeline-bin-budget.md), [0039](adr/0039-the-edits-chart-collapses-idle-stretches-into-marked-breaks.md) |

## Real time

Everything beyond the text itself reaches a page by timers today: an open editor polls the members every 5 s, and the timeline, summaries and bin edits every 3 s while the panel is open, so an idle tab costs 12 to 72 requests a minute and another author's edit reaches the chart up to 4.5 s late (1.5 s of projection throttle plus one poll). Four decisions chose polling for its simplicity and robustness ([0012](adr/0012-selection-summaries-cached-per-filter-and-cursor.md), [0032](adr/0032-connection-state-truth-callback-for-transitions-server-presence-for-recovery.md), [0036](adr/0036-the-superseded-creator-page-learns-of-the-takeover-from-the-members-poll.md), [0041](adr/0041-the-summary-card-shows-the-sentence-as-it-is-written.md)). The signal that reopens them is the polling cost in the request logs or the chart's lag being noticed, and there are two sizes of answer:

| Option | What changes | Keeps | Cost |
|--------|--------------|-------|------|
| **Invalidation over the socket** | The server sends one "document changed" frame per projection batch, presence change or summary step on the collaboration socket already open; the client invalidates the matching queries and refetches, and the polls fall back to a long interval (30 s) while the socket is connected | Every HTTP route, cache and budget as they are; the poll as the recovery path when the socket is down | One stateless message kind, coalesced per document so a push never amplifies load; four superseding ADRs |
| **Full real time** | The timeline bins, summaries, members and version state are pushed as data over the socket, and the panel renders what arrives without a round trip | The HTTP routes for first paint, MCP clients and time travel | A second wire format for every read model, per-document fan-out with back-pressure, and the per-user budgets of [0044](adr/0044-version-builds-are-budgeted-per-user-and-capped-in-the-projection-queue.md) re-expressed for pushes |

Invalidation first: it removes most of the idle traffic and brings the chart's lag down to the projection throttle, while the readiness and running-summary polls stay as they are because they are short and already budgeted.

## Integrations

- **Public API.** The timeline, events, versions and summaries endpoints already serve the SPA. The OAuth that admits MCP clients ([ADR 0025](adr/0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md)) can issue tokens for them too, so another product reads a document's history with its owner's consent.
- **Webhooks.** The projection cursor already orders every edit event and version mark; a delivery table driven by it sends "edits projected", "version marked" and "summary ready" to a subscriber, retried until acknowledged.
- **AI inside the app.** The MCP tool registry ([agentic history](features/agentic-history-mcp/spec.md)) can back an in-app agent panel with the same permissions and the same "Name · AI" marks. Accepting or rejecting tracked changes stays with the person.
- **Organisations and SSO.** Better Auth's organisation and SSO plugins; admin becomes per organisation and invites carry one ([ADR 0005](adr/0005-authentication-with-better-auth.md), [ADR 0010](adr/0010-documents-ownership-and-share-links.md), [ADR 0020](adr/0020-invite-only-accounts-with-a-first-claim-admin.md)).
- **Email.** Invitations and password resets sent instead of copied ([ADR 0010](adr/0010-documents-ownership-and-share-links.md), [ADR 0020](adr/0020-invite-only-accounts-with-a-first-claim-admin.md)).
- **Document sources.** Import from and save back to Google Drive or SharePoint, with the uploaded file's tracked changes imported under their authors as uploads already are.

## Product

- **Compare two versions.** Any two marks side by side, the difference rendered as tracked changes.
- **Paragraph blame.** The read model already records the block of every edit; a margin shows who wrote each paragraph and when.
- **Audit trail.** An export of every edit with its author, actor and time, for contracts and compliance reviews.
- **Proposals.** Fork a document at a mark, edit apart, and bring the fork back as tracked changes the owner accepts.
- **Stable topics.** Topics keep an identity across Summarize presses, so bands stop regrouping ([ADR 0015](adr/0015-topics-recompute-trigger-and-identity.md), [ADR 0031](adr/0031-one-summarize-job-runs-only-what-is-stale.md)).
- **History as a SuperDoc extension.** The history library is already its own package; packaged with the timeline panel, any SuperDoc host gains capture, time travel and the chart.
