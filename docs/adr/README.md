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
| [0013](0013-deploy-with-dokploy-compose.md) | Deploy with a Dokploy compose service built from the repository | Superseded by [0018](0018-deploy-on-railway.md) | 2026-10-16 |
| [0014](0014-one-source-per-agent-surface.md) | One source per agent surface, a thin adapter per tool | Accepted | 2026-10-17 |
| [0015](0015-topics-recompute-trigger-and-identity.md) | Topics: when they are recomputed and how they keep their identity | Accepted | 2026-10-17 |
| [0016](0016-timeline-bin-budget.md) | The timeline draws at most 120 bins | Accepted | 2026-10-17 |
| [0017](0017-share-links-reissued-when-the-secret-changes.md) | Share links are reissued when the signing secret changes | Accepted | 2026-10-17 |
| [0018](0018-fan-out-ci-and-prebuild-the-projection-worker.md) | Fan CI out into independent jobs and boot a prebuilt projection worker in tests | Accepted | 2026-10-17 |
| [0019](0019-deploy-on-railway.md) | Deploy the demo on Railway | Accepted | 2026-10-17 |
