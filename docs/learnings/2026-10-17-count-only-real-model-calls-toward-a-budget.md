# A spend budget must count only jobs that reach the model

- Date: 2026-10-17
- Inspired by: slice 3 fix wave (`apps/server/src/insights/insights-worker.ts`): the first version of the hourly cap counted every job, so an empty document polled every 3 s exhausted sixty calls in three minutes and every other document showed "busy"; slice 4 repeated the rule for the per-document cooldown and the selection summaries
- Revisited: 2026-10-17 — `consumeCall()` and `cooldown.start()` sit right before `generateStructured`; `hasCallBudget()` reads without spending

## Signal
Topics flip to "busy" across the process although the provider dashboard shows almost no calls; the budget drained on no-ops.

## Cause
Counting at job start charges early returns (no model configured, empty document, nothing stale, already running) as if they were paid calls; polling turns a cheap no-op into a budget leak.

## Do
Consume budgets and cooldowns at the single point where the paid call starts, expose a read-only check for "would this be refused" so routes can answer 503 without writing anything, and test that a hundred no-op jobs leave the budget intact.

## Anchor
`apps/server/src/insights/insights-worker.ts`, `topics-service.ts`, `selection-summaries-service.ts`, their tests
