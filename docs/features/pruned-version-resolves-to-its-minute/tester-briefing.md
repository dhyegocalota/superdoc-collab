# Tester briefing: A pruned version sequence resolves to its minute

## What changed

- `libs/history/src/version-marks.ts` — `resolveMark`.
- `libs/history/src/update-log.ts` — `serverTimeOf`.
- `apps/server/src/history/versions-service.ts` — resolves through the log; `apps/server/src/server.ts` passes it.
- `apps/server/src/history/versions-routes.test.ts` — property test against `resolveMark`.

## How to run

```bash
pnpm --filter @superdoc-collab/history test:unit
pnpm --filter @superdoc-collab/server test:unit -- src/history
pnpm test:e2e e2e/time-travel.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `version-marks.test.ts::a sequence whose mark was pruned…` | stub threw `resolveMark is not implemented` | the minute's surviving mark is returned |
| `version-marks.test.ts::a sequence the log does not know clamps down like before` | same stub | clamp kept for unknown sequences |

Red commit: `2950b9e`.

## Hypotheses to attack

1. Hypothesis: the trace's case (666 → 591) now yields 678. Break it by: the unit fixture mirrors it; also replay by hand with marks `[591 bootstrap, 678 minute M]` and `serverTime` in M.
2. Hypothesis: nothing changes for sequences that are marks. Break it by: the property test's mark sequences resolve to themselves.
3. Hypothesis: a sequence past the newest mark resolves to the newest mark. Break it by: request a huge sequence through the route.

## Known gaps

- `serverTimeOf` has no dedicated unit test yet beyond the route property test; add one if you find the time.
