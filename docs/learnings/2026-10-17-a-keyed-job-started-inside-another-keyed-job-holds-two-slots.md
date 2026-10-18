# One Summarize click uses two process-wide job slots and a regroup is refused as busy

- Date: 2026-10-17
- Inspired by: red `5293de5`, fix `5e83029` (agent summary never regroups, regroup shares the topics job)
- Revisited: 2026-10-17 — still true

## Signal
With the model idle, a single Summarize call answers busy, or the agent summary triggers a second topics call. The count of model calls in the test is larger than the steps the call shows.

## Cause
The Summarize job started the topics job from inside itself. Each job is keyed in the runner, which allows a fixed number at once for the whole process, so the nested one counted as a second slot and a second model call.

## Do
Never call `run` of a keyed job from inside another keyed job. Wait on the running one with `InsightsJobRunner.settled(key)` and reuse its result, and keep the regroup on the topics key so it shares that job.

## Anchor
`apps/server/src/insights/insights-job-runner.ts` (`settled`), `topics-service.ts`, `summarize-service.ts`, commits `5293de5`, `5e83029`
