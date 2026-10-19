# A pruned version sequence resolves to its minute

**Status:** Shipped 2026-10-17
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 ("fix os 5 achados", finding 3 after PR #31; the reviewer's trace turned the flake into this product defect)
**ADRs:** [0027](../../adr/0027-a-pruned-version-sequence-resolves-to-its-minute.md)
**Not changing:** the client pin (`?at=`), the one-mark-per-minute budget (ADR 0003), `clampToMark` for sequences the log does not know, the E2E spec itself.

## Problem

A client that read the timeline while the projection was behind pins a sequence equal to the projection cursor; the next batch prunes that mark within its minute, and `/versions/<sequence>` clamped down to the bootstrap mark: the live bin showed the seed document without the minute's edits, and stayed so. Seen as the CI flake of `e2e/time-travel.spec.ts:95` (four runs on 2026-10-17); a shared `?at=` link can hit it too.

## Change

- `libs/history`: `resolveMark({ marks, sequence, serverTime })`: the exact mark when it exists; otherwise, with the sequence's `serverTime` from the log, the surviving mark of that minute; without a `serverTime`, the old clamp. `UpdateLog.serverTimeOf({ documentName, sequence })`.
- `apps/server`: `VersionsService` takes the update log and resolves through `resolveMark`; the versions route is unchanged.

## Tests

- Unit `version-marks.test.ts` (red first at 2950b9e): pruned sequence → its minute's mark; unknown sequence → clamp; no marks → null.
- Unit `versions-routes.test.ts`: the property test compares resolved sequences against `resolveMark` with the log's `serverTime`, and the text equals the replay until the resolved sequence.
- E2E: `pnpm test:e2e e2e/time-travel.spec.ts` green; the CI dispatch on the PR is the proof against the loaded-runner race.
