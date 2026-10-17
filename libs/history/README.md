# @superdoc-collab/history

The history engine: the append-only Yjs update log with authorship, the projection from that log into edit events, version marks, and the pure timeline and topic math the server serves ([ADR 0001](../../docs/adr/0001-event-sourcing-over-yjs.md), [ADR 0002](../../docs/adr/0002-authorship-observed-vs-declared.md)). It has no build step: Vite and the server bundle compile it from source.

It owns two SQLite databases, the update log and the read model, each with its own migrations. Facts the code relies on are in [`.claude/rules/history.md`](../../.claude/rules/history.md).
