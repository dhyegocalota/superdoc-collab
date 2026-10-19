# 0043. A known version sequence resolves exactly; marks anchor the timeline

- Status: Accepted
- Date: 2026-10-19
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [version view after a delete](../features/version-view-after-delete/spec.md), [ADR 0003](0003-time-travel-with-native-yjs-snapshots.md), [ADR 0027](0027-a-pruned-version-sequence-resolves-to-its-minute.md), [learning](../learnings/2026-10-19-a-version-mark-per-minute-lets-a-later-delete-blank-an-earlier-bin.md)

## Context

A version mark is the last update of each minute. ADR 0027 made a sequence whose mark was pruned resolve to the surviving mark of its minute. A user who adds a paragraph, edits it and deletes it within one minute opens the version of the edit and sees a blank document, because the only mark of that minute holds the delete. Marks cannot answer "the document right after this edit" at any width short of one per update.

## Decision

`/versions/<sequence>` resolves a sequence the update log knows to that very sequence. The worker builds its state with `GcFreeReplays.versionAt`: the latest compaction snapshot at or before the sequence merged with the log tail up to it gives a Yjs snapshot, which `Y.createDocFromSnapshot` restores over the gc-free replay. Marks stay what ADR 0003 made them, one per minute, the anchors the timeline hands out per bin. A sequence the log does not know still clamps down to the latest mark at or before it, and a sequence at or before the bootstrap resolves to the bootstrap. Each edit row of a bin carries `versionSequence`, the sequence of its last inserting event, and its View version button pins that sequence in the URL next to `at`.

This supersedes the resolution rule of ADR 0027 and keeps its clamp for unknown sequences.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Resolve known sequences exactly (chosen) | the version after any edit; a pinned sequence never moves; closes the ADR 0027 race | a version costs a merge of the log up to it | — |
| Narrow the mark window to the narrowest bin | one constant | an edit and a delete in one bin still open blank; six times the marks | does not cover the owner's repro |
| One mark per update | exact by lookup | storage grows with every keystroke | the budget was decided in ADR 0003 |

## Consequences

- The version cache, the version rooms and the replay cache are keyed and bounded as before, now by exact sequence.
- `resolveMark` returns `{ sequence, serverTime }`; the pruned-minute tests of ADR 0027 became exact-sequence tests.
- A bin opens the exact sequence of its last event at or before its last instant, not a mark; the edit row opens the version after its own edit, so a delete later in the same bin still blanks the bin but not the row.

## Evidence

- `libs/history/src/version-state.test.ts`: the version at an edit's sequence shows the edit after a later delete; every logged sequence restores exactly as a full replay.
- `e2e/time-travel.spec.ts`: the owner's five steps with no waiting open the edited paragraph from the edit row.
- Build time: see the spec of the feature.

## Revisit when

- A version takes long enough on a large log that a nearer snapshot is worth keeping.
- The edit list shows one row per event instead of one per block.
