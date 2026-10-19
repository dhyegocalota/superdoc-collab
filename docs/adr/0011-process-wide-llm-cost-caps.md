# 0011. Process-wide caps on language-model spend

- Status: Accepted (lead ruling under the owner's overnight authorization of 2026-10-16; the owner confirms or changes the numbers before the deploy slice). The topics bullet of the Decision is refined by [0015](0015-topics-recompute-trigger-and-identity.md): a busy automatic recompute keeps the ready topics.
- Date: 2026-10-16
- Deciders: Claude (lead, by delegated authority); Dhyego Calota (owner, to confirm)
- Inspired by: slice 3 final review ("no overall LLM cost cap; sign-up is open and the deploy uses the owner's key"), [0006](0006-llm-provider.md), [0008](0008-vertical-slices.md)

## Context

Topics are named on a document's first open and on every Refresh, and per-topic sentences are refreshed once a minute when edits arrive. Every limit was per document: one run in flight, a 30 s refresh cooldown, a 60 s recompute interval. Sign-up is open, so one visitor can create any number of documents, and the demo deploys with the owner's OpenRouter key. Nothing bounded the total spend of the process.

## Decision

- `InsightsWorker` enforces two process-wide caps: at most `LLM_MAX_CONCURRENT_JOBS = 2` jobs running, and at most `LLM_MAX_CALLS_PER_HOUR = 60` model calls in a sliding one-hour window.
- The hourly budget is consumed at the model call, in the same place the refresh cooldown is consumed, so jobs that end before reaching the model (no model configured, empty document, nothing stale) cost nothing.
- Over a cap the job fails visibly: topics become `failed` with `LLM_BUSY_MESSAGE` and the panel offers Retry; summaries log and skip without recording a run, so they retry on the next read. Nothing is queued or dropped silently.
- The cooldown is not consumed by a refused job, so a Retry after the window works.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| No process-wide cap (per document only) | Simplest | Spend scales with documents created; open sign-up | Rejected by the final review |
| Per-user quota | Fair between users | Needs a user ledger; a visitor can create accounts | Not enough on its own; can be added |
| Queue instead of refuse | Every request eventually runs | Hides the cost and the delay; the queue itself is unbounded | Visible failure is cheaper and honest |
| Hard daily budget in money | Matches the real constraint | Needs token accounting per call and provider prices | Calls per hour approximates it well enough for a demo |

## Consequences

- A burst of first opens across many documents shows "busy" instead of spending; the 61st call in an hour waits for the window.
- The numbers are defaults in `libs/types`/`apps/server` and can be raised or lowered through `LLM_MAX_CONCURRENT_JOBS` and `LLM_MAX_CALLS_PER_HOUR` (documented in `.env.example`); the E2E suite raises the hourly cap because one run names topics for dozens of documents; the owner tunes the deploy values before PR 5.
- Multi-instance servers would need a shared counter (out of scope: single instance, ADR 0004).

## Evidence

- `apps/server/src/insights/insights-worker.test.ts`: concurrency cap, hourly cap, window rollover, jobs that never reach the model spend nothing; `topics-service.test.ts`: 100 empty-document jobs then a real one still starts.

## Revisit when

- The owner sets the real budget, or the product gets per-user accounts with quotas.

## Amendment 2026-10-18

`InsightsWorker` in `insights-worker.ts` is now `InsightsJobRunner` in `insights-job-runner.ts`. The decision is unchanged.
