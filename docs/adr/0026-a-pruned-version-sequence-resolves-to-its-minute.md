# 0026. A pruned version sequence resolves to the surviving mark of its minute

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the reviewer's trace of CI run 39050524747 (`e2e/time-travel.spec.ts:95`), [ADR 0003](0003-time-travel-with-native-yjs-snapshots.md) addendum (one mark per minute), `libs/history/src/read-model.ts` (`PRUNE_MINUTE`)

## Context

Version marks are kept once per minute: when a later mark lands in a minute, the earlier non-bootstrap mark of that minute is pruned. The timeline hands the client a `versionSequence` per bin; the client pins it in the URL (`?at=`) and asks `/versions/<sequence>`. When the client read the timeline while the projection was behind, every bin carried the projection cursor as its sequence, a mark that the next projection batch pruned. `clampToMark` then resolved the pruned sequence to the latest mark at or before it, which inside a minute is the bootstrap mark: the user opened the live bin and saw the seed document without that minute's edits, and the pin kept it that way. The E2E failed that way four times on 2026-10-17; the same race reaches users.

## Decision

`/versions/<sequence>` resolves a sequence that is no longer a mark through the update log: the log knows the sequence's `serverTime`, so the version is the surviving mark of that minute (`versionSequenceAt` on that time). Only a sequence the log does not know at all clamps down as before. The client pin is untouched.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Resolve through the sequence's `serverTime` in the update log (chosen) | one place, server-side; every client, including shared `?at=` links, gets the minute the sequence belonged to; a unit-testable pure function | one indexed read of the log per resolution | — |
| Client re-pins when the resolved sequence is below the bin's `versionSequence` | no server change | every client must carry the rule; a shared link opened later still asks for the pruned sequence and gets the seed first; the race window moves, it does not close | the resolution is the server's knowledge, not the client's |
| Never prune within the live minute | no pruned sequence can be pinned | the read model grows by one mark per batch during active editing; the addendum's "one mark per minute" stops being true | the budget was decided in ADR 0003 |

## Consequences

- `UpdateLog.serverTimeOf` is a point read by primary key; `VersionsService` takes the update log.
- A pinned sequence from a stale timeline read now shows the minute's final state rather than the seed; the banner's sequence is the surviving mark's.
- The route property test compares against `resolveMark`, so a sampled pruned sequence resolves to its minute.

## Evidence

- CI run 39050524747, error context: the client requested sequence 666, `/versions/666` answered `{ sequence: 591 }` (the bootstrap), text equal to the two seed paragraphs.
- `libs/history/src/version-marks.test.ts`: a pruned sequence in the third minute resolves to that minute's mark; an unknown sequence still clamps.

## Revisit when

- Marks become finer than a minute, or pruning stops.
- The timeline stops handing out the projection cursor as a bin's sequence while behind, which would remove the usual source of pruned pins.
