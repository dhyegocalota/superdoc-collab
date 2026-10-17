# @superdoc-history/history

The history engine: the append-only Yjs update log with authorship, the projection from that log into edit events, version marks, and the pure timeline and topic math the server serves ([ADR 0001](../../docs/adr/0001-event-sourcing-over-yjs.md), [ADR 0002](../../docs/adr/0002-authorship-observed-vs-declared.md)). It has no build step: the server's tsup bundle inlines it.

## Entry points

| Import | Exposes |
|---|---|
| `@superdoc-history/history` | update log, document history, projection, read model, version marks and state, imported revisions, DOCX helpers, timeline and topics |
| `@superdoc-history/history/timeline` | bins, runs, bands, stacking and word counts for the streamgraph |
| `@superdoc-history/history/testing` | test databases and room fixtures |

## Databases

| File | Tables | Schema | Migrations |
|---|---|---|---|
| `history.sqlite` | update log, snapshots, client identities | [`src/schema/history.ts`](src/schema/history.ts) | [`drizzle/history/`](drizzle/history/) |
| `read-model.sqlite` | edit events, version marks, projection cursor | [`src/schema/read-model.ts`](src/schema/read-model.ts) | [`drizzle/read-model/`](drizzle/read-model/) |

After a schema change, `pnpm --filter @superdoc-history/history generate` writes the migrations for both databases. The Docker image ships both sets.

## Layout

| Path | Holds |
|---|---|
| [`src/update-log.ts`](src/update-log.ts) | append, snapshots, identities and materialize |
| [`src/document-history.ts`](src/document-history.ts), [`src/document-content.ts`](src/document-content.ts) | bootstrap detection and reading the main story's blocks |
| [`src/projection.ts`](src/projection.ts), [`src/edit-events.ts`](src/edit-events.ts) | replaying updates into edit events with their authors |
| [`src/read-model.ts`](src/read-model.ts) | the projected events and the cursor |
| [`src/version-marks.ts`](src/version-marks.ts), [`src/version-state.ts`](src/version-state.ts) | the exact version a timestamp resolves to and its state |
| [`src/imported-revisions.ts`](src/imported-revisions.ts) | tracked changes already in an uploaded DOCX |
| [`src/timeline/`](src/timeline/) | the streamgraph math ([ADR 0016](../../docs/adr/0016-timeline-bin-budget.md)) |
| [`src/topics/`](src/topics/) | the topic schema and block-to-topic assignment ([ADR 0015](../../docs/adr/0015-topics-recompute-trigger-and-identity.md)) |

Facts the code relies on are in [`.claude/rules/history.md`](../../.claude/rules/history.md).

## Commands

`typecheck` (`tsc --noEmit`) and `test:unit` (Vitest), through `pnpm --filter @superdoc-history/history <script>`.
