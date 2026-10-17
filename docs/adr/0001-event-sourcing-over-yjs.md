# 0001. Capture live history by event-sourcing the Yjs update stream

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: POC results (removed 2026-10-17), POC test plan (removed 2026-10-17)

## Context

The product must show who contributed what to a document over time. SuperDoc v2 exposes no ProseMirror access and no version-history or time-travel API. `diff.capture/compare/apply` exists, but its payload is opaque. Collaboration runs over Yjs through Hocuspocus (`providerType: 'hocuspocus'`, room `sd2/v2.1/<documentId>`), so every edit already crosses a server we control.

## Decision

Event-source the Yjs update stream ("B+"):

- Hocuspocus `onChange` appends every Yjs update to an append-only SQLite log, the `updates` table: `sequence`, `document_name`, `connection_user_id`, `yjs_client_ids`, `server_time`, `update_bytes`.
- A pure projection replays the updates and diffs block text per update (`diffChars`) into `EditEvent{sequence, serverTime, authorIds, blockId, kind: Created|Removed|Modified|Merged, inserted, deleted}`.
- Events are grouped into windows by the rules `idleGapMs`, `maxWindowMs` and `coEditGapMs`.
- Imported DOCX tracked changes come from `trackChanges.list()` via `@superdoc/sdk` and are merged in as `imported: true` events.
- Authorship of each update is resolved as described in [0002](0002-authorship-observed-vs-declared.md).

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| A. Force suggesting/track-changes mode and read `w:ins`/`w:del` | Uses a native Word concept | Pollutes the document; the user can defeat it; no timing granularity | History would depend on user behavior and carry no time axis |
| B. Periodic snapshots + `diff.compare` | Uses the official diff API | Payload is opaque; loses who typed what inside a window; race-prone | Cannot attribute authorship exactly |
| C. Own client-side text diff | No server work | Trusts the client; misses concurrent edits | Attribution is unverifiable and incomplete |
| **B+. Event-source the Yjs stream on the server** | Server is the source of truth; exact per-update attribution; replayable | Server-side log and projection to build | Chosen |

## Consequences

- The server is the source of truth for history; every character has an author.
- The log is replayable, so projections and window rules can change without losing data.
- Not covered yet: formatting-only changes, tables, headers and footers, comments as events, and multi-instance servers.

## Evidence

- POC: 14/14 unit and 20/20 E2E tests green twice in a row.
- Hypotheses H1-H10 pass: convergence, exact attribution including character-level interleaving, replay equals live, chaos (latency 0-2000 ms, cuts, SIGKILL), deterministic windows.
- Footprint: about 6 updates and 2.9 KB per keystroke, roughly 3% on top of SuperDoc's own room state because SuperDoc retains its operations journal.
- Speed: projection 0.13-0.17 ms per update; append about 33k updates/s.

## Revisit when

- SuperDoc ships a history or time-travel API.
- Multi-instance deployment is needed.

## Addendum 2026-10-17

The window grouping (`idleGapMs`, `maxWindowMs`, `coEditGapMs`) was ported from the POC but never used: the timeline groups edits into runs per author, block and bin (`libs/history/src/timeline/`), so `edit-windows` and `single-flight` were deleted in refinement-tests; the POC still proves H10.
