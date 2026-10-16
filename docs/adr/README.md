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
| [0003](0003-time-travel-with-native-yjs-snapshots.md) | Implement time travel with native Yjs snapshots | Proposed | 2026-10-16 |
| [0004](0004-stack.md) | Technology stack | Accepted | 2026-10-16 |
| [0005](0005-authentication-with-better-auth.md) | Authenticate with Better Auth | Accepted | 2026-10-16 |
| [0006](0006-llm-via-vercel-ai-sdk.md) | Call LLMs through the Vercel AI SDK | Accepted | 2026-10-16 |
| [0007](0007-read-model-in-sqlite.md) | Serve reads from a SQLite read model | Proposed | 2026-10-16 |
