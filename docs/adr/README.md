# Architecture Decision Records

An ADR records one architecturally significant decision: the context that forced it, the option chosen, the options rejected and why, and the conditions under which it should be reopened. ADRs are short, immutable once accepted, and written from [`_template.md`](_template.md).

## Numbering

- File name: `NNNN-kebab-slug.md`, four digits, assigned in order of creation.
- Numbers are never reused and never renumbered.
- A decision is changed by writing a new ADR and marking the old one `Superseded by [NNNN](NNNN-slug.md)`. The old file stays in place.

## Status lifecycle

- `Proposed`: written, not yet confirmed by the owner or pending a spike.
- `Accepted`: confirmed; the code follows it.
- `Superseded by [NNNN](NNNN-slug.md)`: replaced; kept for history.

A `Proposed` ADR moves to `Accepted` by editing its status line and date. Any other change of substance requires a new ADR.

## Index

| Number | Title | Status | Date |
|--------|-------|--------|------|
| [0001](0001-event-sourcing-over-yjs.md) | Capture live history by event-sourcing the Yjs update stream | Accepted | 2026-10-16 |
| [0002](0002-authorship-observed-vs-declared.md) | Bind Yjs clientIds to users in two tiers | Accepted | 2026-10-16 |
| [0003](0003-time-travel-with-native-yjs-snapshots.md) | Implement time travel with native Yjs snapshots | Accepted | 2026-10-16 |
| [0004](0004-stack.md) | Technology stack | Accepted | 2026-10-16 |
| [0005](0005-authentication-with-better-auth.md) | Authenticate with Better Auth | Accepted | 2026-10-16 |
| [0006](0006-llm-via-vercel-ai-sdk.md) | Call LLMs through the Vercel AI SDK | Accepted | 2026-10-16 |
| [0007](0007-read-model-in-sqlite.md) | Serve reads from a SQLite read model | Accepted | 2026-10-16 |
| [0008](0008-vertical-slices.md) | Deliver the product as five vertical slices | Accepted | 2026-10-16 |
| [0009](0009-design-system.md) | Design system: Tailwind with shadcn/ui, visually coherent with SuperDoc | Accepted | 2026-10-16 |
| [0010](0010-documents-ownership-and-share-links.md) | Documents: owner, two share links, files on the data volume | Accepted | 2026-10-16 |
| [0011](0011-process-wide-llm-cost-caps.md) | Process-wide caps on language-model spend | Accepted (owner to confirm the numbers) | 2026-10-16 |
| [0012](0012-selection-summaries-cached-per-filter-and-cursor.md) | Cache selection summaries per filter, stamped with the cursor | Accepted | 2026-10-16 |
| [0013](0013-deploy-with-dokploy-compose.md) | Deploy with a Dokploy compose service built from the repository | Superseded by [0019](0019-deploy-on-railway.md) | 2026-10-16 |
| [0014](0014-one-source-per-agent-surface.md) | One source per agent surface, a thin adapter per tool | Accepted | 2026-10-17 |
| [0015](0015-topics-recompute-trigger-and-identity.md) | Topics: when they are recomputed and how they keep their identity | Accepted | 2026-10-17 |
| [0016](0016-timeline-bin-budget.md) | The timeline draws at most 120 bins | Accepted | 2026-10-17 |
| [0017](0017-share-links-reissued-when-the-secret-changes.md) | Share links are reissued when the signing secret changes | Accepted | 2026-10-17 |
| [0018](0018-fan-out-ci-and-prebuild-the-projection-worker.md) | Fan CI out into independent jobs and boot a prebuilt projection worker in tests | Accepted | 2026-10-17 |
| [0019](0019-deploy-on-railway.md) | Deploy the demo on Railway | Accepted | 2026-10-17 |
| [0020](0020-invite-only-accounts-with-a-first-claim-admin.md) | Invite-only accounts with a first-claim admin | Accepted | 2026-10-17 |
| [0022](0022-mechanical-security-gates-and-a-security-reviewer.md) | Mechanical security gates in CI and a dedicated security reviewer before every PR | Accepted | 2026-10-17 |
| [0023](0023-agentic-scenario-runs-with-one-browser-per-author.md) | Agentic scenario runs with one Playwright MCP server per author | Accepted | 2026-10-17 |
| [0024](0024-times-follow-the-readers-zone-storage-stays-epoch.md) | Times follow the reader's zone; storage stays epoch milliseconds | Accepted | 2026-10-17 |
| [0025](0025-mcp-clients-authorize-with-oauth-and-join-rooms-by-room-token.md) | MCP clients authorize with OAuth; agents join rooms with a short-lived room token | Accepted | 2026-10-17 |
| [0026](0026-the-agent-repairs-its-own-machine-doctor-reports-never-installs.md) | The agent repairs its own machine: a doctor reports at session start and never installs | Accepted | 2026-10-17 |
| [0027](0027-a-pruned-version-sequence-resolves-to-its-minute.md) | A pruned version sequence resolves to the surviving mark of its minute | Accepted | 2026-10-17 |
| [0028](0028-the-actor-not-the-name-marks-an-ai-in-our-interface.md) | The actor, not the name, marks an AI in our interface | Accepted | 2026-10-17 |
| [0029](0029-agent-edits-carry-a-human-or-agent-actor.md) | Agent edits carry an actor next to the user they act for | Accepted | 2026-10-17 |
| [0030](0030-the-local-gate-runs-what-the-diff-can-break.md) | The local gate runs what the diff can break | Accepted | 2026-10-17 |
| [0031](0031-one-summarize-job-runs-only-what-is-stale.md) | One Summarize job runs only what is stale: topics, then the selection summary, then the topic sentences | Accepted | 2026-10-17 |
| [0032](0032-connection-state-truth-callback-for-transitions-server-presence-for-recovery.md) | Connection state truth: the SuperDoc callback for transitions, server presence for recovery | Accepted | 2026-10-17 |
| [0033](0033-one-creator-per-room-reservation-with-per-attempt-write-fencing.md) | One creator per room: a reservation with per-attempt write fencing and expiry | Accepted | 2026-10-17 |
| [0034](0034-collaboration-socket-payload-and-rate-limits.md) | Collaboration socket limits: a per-message payload cap and a per-connection rate cap | Accepted | 2026-10-17 |
| [0035](0035-the-pdf-prints-from-a-same-origin-frame-with-its-own-viewport.md) | The PDF prints from a same-origin frame with its own viewport | Accepted | 2026-10-17 |
| [0038](0038-phone-time-travel-confirms-with-an-inline-second-tap.md) | Phone time travel confirms with an inline second tap and shows its loading | Accepted | 2026-10-18 |
| [0036](0036-the-superseded-creator-page-learns-of-the-takeover-from-the-members-poll.md) | The superseded creator's page learns of the takeover from the members poll | Accepted | 2026-10-18 |
| [0037](0037-author-colour-slots-are-assigned-per-document-by-join-order.md) | Author colour slots are assigned per document by join order | Accepted | 2026-10-18 |
| [0040](0040-the-socket-frame-cap-allows-fast-typing-and-reconnect-bursts.md) | The socket frame caps allow fast typing and reconnect bursts | Accepted | 2026-10-18 |
