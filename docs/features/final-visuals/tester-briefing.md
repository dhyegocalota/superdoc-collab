# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>


## G4 Summarize job (developer-4, branch `feat/final-visuals-g4`)

### What changed

- `apps/server/src/insights/summarize-service.ts` (new) — `SummarizeService.request` decides from three staleness checks whether to start one job per document, answers with `SummarizeOutcome` (`Started`, `AlreadyRunning`, `UpToDate`, `Busy`, `Unavailable`), and the job runs regroup, selection summary, sentences in that order, setting `SummarizeStep` on the selection service and returning to `Idle` in a `finally`.
- `apps/server/src/insights/topics-service.ts` — gains `isStale` and `regroup`; loses `refresh`, `RefreshOutcome`, `TOPIC_REFRESH_COOLDOWN_MS`, the cooldown and `forget`.
- `apps/server/src/insights/summaries-service.ts` — `refreshStale` becomes `isStale` and `rewriteStale`; the read-path refresh, `SUMMARY_MIN_INTERVAL_MS`, the cooldown and `forget` are gone.
- `apps/server/src/insights/selection-summaries-service.ts` — keeps `request` for the agent tool; gains `isStale`, `write`, `setStep`, the per-document step, `view.step`; the cooldown uses `SUMMARIZE_COOLDOWN_MS`.
- `apps/server/src/insights/insights-routes.ts` — selection POST goes through `summarize.request`; the topics refresh route and the read-path refresh are removed.
- `apps/server/src/insights/last-sequence.ts` (new) — `lastSequenceOf`, shared by topics and summaries.
- Outside my list, forced by the removals: `apps/server/src/http/app.ts` and `apps/server/src/server.ts` (wire `summarize`), `apps/server/src/collaboration/collaboration-runtime.ts` (drops the two `forget` calls), `apps/server/src/documents/documents-routes.test.ts` (cooldown/forget test now covers the selection service only).
- `libs/types/src/timeline.ts` — G1 mirror (`SummarizeStep`, `SUMMARIZE_COOLDOWN_MS`, `SUMMARIZE_BUSY_MESSAGE`, `SelectionSummaryView.step`, commit e9350e1); `SELECTION_SUMMARY_COOLDOWN_MS` removed. The lead keeps G1's version at merge.
- `apps/web/src/features/timeline/summarize-edits-button.tsx` — takes `{ isRunning, onSummarize }`, never disabled, `aria-busy`, `Sparkles`, label `SUMMARIZING_LABEL` while running.
- `apps/web/src/features/timeline/use-selection-summary.ts` — polls while `state` is running or `step` is not idle.
- `apps/web/src/features/timeline/timeline-api.ts` — `SummaryTooSoonError` now carries `SUMMARIZE_BUSY_MESSAGE`.
- `apps/web/src/features/timeline/timeline-copy.ts` — `SUMMARIZING_LABEL` (G3 mirror, commit 4189579).
- `docs/adr/0031-…md` — Evidence line names the real tests.

### HTTP contract of `POST /api/documents/:id/summaries/selection`

| Answer | When | Body | Header |
|--------|------|------|--------|
| 202 | job started, or one already runs | selection view with `state: running`, `step: grouping` or `summarizing` | none |
| 200 | nothing is stale (summary cached, selection empty, topics fresh, sentences fresh) | selection view, `step: idle` | none |
| 429 | cooldown running, hourly call budget spent, or all worker slots taken | `{ error: SUMMARIZE_BUSY_MESSAGE }` | one `Retry-After`, seconds, the longer of the remaining cooldown and the model busy wait |
| 503 | model not configured | `{ error: <reason> }` | `Retry-After: 1` |
| 400 | bad query | `{ error: INVALID_TIMELINE_QUERY_MESSAGE }` | none |
| 403, 404 | reader, stranger | as before | none |

`POST /api/documents/:id/topics/refresh` answers 404. `GET /api/documents/:id/summaries` never calls the model.

### Red today, green after

| Test | Red before because | Green after because |
|------|--------------------|---------------------|
| `apps/server/src/insights/summarize-service.test.ts` (all 7) | `Cannot find module './summarize-service'` (45708c9) | b63b57f |
| `insights-routes.test.ts::POST /:documentId/topics/refresh no longer exists` | `expected 202 to be 404` (dd2b2b3) | 4116a80 |
| `insights-routes.test.ts::a full worker answers 429 with SUMMARIZE_BUSY_MESSAGE` and `::an exhausted hourly cap answers 429 …` | `expected 503 to be 429` | 4116a80 |
| `insights-routes.test.ts::a second POST inside the cooldown answers 429 with one Retry-After and SUMMARIZE_BUSY_MESSAGE` and `::a second POST with the same filter is 200 from the cache and another filter inside the cooldown is 429` | `expected { Object (error) } to deeply equal { Object (error) }` (the too-soon text) | 4116a80 |
| `insights-routes.test.ts::the Retry-After is the longer of the cooldown and the model's busy wait` | `expected '30' to be '90'` | 4116a80 |
| `insights-routes.test.ts::POST selection answers 202 with the running step while a job runs, started or already running` | the 202 view did not report `step: summarizing` | 4116a80 |
| `apps/web/src/features/timeline/use-selection-summary.test.ts::polls while step is not idle and stops at idle` | `expected +0 to be 2 // Object.is equality` (37132b0) | 78d63e5 |
| `apps/web/src/features/timeline/summarize-edits-button.test.tsx::is never disabled, and while running reads Summarizing… with aria-busy` | `expect(element).toBeEnabled()` received the button with `disabled=""` | 78d63e5 |

Pins, green when they landed: `insights-routes.test.ts::GET selection returns step idle when no job runs`, `::POST selection answers 200 and starts no job when nothing is stale`, and `selection-summaries-service.test.ts::uses SUMMARIZE_COOLDOWN_MS (30000)` (the G1 mirror already exported the constant).

The plan names `use-selection-summary.test.tsx`; the file is `use-selection-summary.test.ts`.

### How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/insights src/documents/documents-routes.test.ts src/agent
pnpm --filter @superdoc-collab/web exec vitest run src/features/timeline/summarize-edits-button.test.tsx src/features/timeline/use-selection-summary.test.ts src/features/timeline/timeline-api.test.ts
```

### Hypotheses to attack

1. Hypothesis: a click on Summarize with fresh topics, summary and sentences makes zero model calls and answers 200. Break it by: click twice in a row with one selection, count calls in the server log.
2. Hypothesis: topics are regrouped only when the last compute failed or `computedAtSequence` is older than the newest edit. Break it by: edit one block inside an existing topic and click; then click again with no edit.
3. Hypothesis: the card sees `grouping` then `summarizing` then `idle` while polling. Break it by: slow the model and watch the GET selection answers.
4. Hypothesis: a second click inside 30 s on a stale selection answers 429 with one `Retry-After` and one message, whatever the underlying wait. Break it by: click, change the filter, click again; exhaust the hourly cap and repeat.
5. Hypothesis: a failed regroup leaves the previous topics and bands in place. Break it by: make the model fail on the topics call and compare the chart before and after.
6. Hypothesis: deleting a document clears the cooldown and the step. Break it by: start a job, delete the document, create another.

### Known gaps

- Pending G3 merge (Step 39): `use-topics.ts`, `refreshTopics`, `TopicsRefreshTooSoonError`, and in libs/types `topicsRefreshApiPath`, `REFRESH_SEGMENT`, `TOPICS_REFRESH_TOO_SOON_MESSAGE` stay because `timeline-panel.tsx` imports them. After G3 lands, delete them and their tests (`timeline-api.test.ts`, `libs/types/src/routes.test.ts`, `timeline-panel.test.tsx`).
- G3 files that must change to compile after the merge: `timeline-panel.tsx` (pass `isRunning` from `view.step !== idle` or the mutation pending state to `SummarizeEditsButton`; drop `disabledReason`, `reasonId`, the Regroup button, `useRefreshTopics`, `regroupDisabledReason`), `timeline-notices.tsx` (its retry used `refreshTopics.mutate`; point it at Summarize), `selection-summary-card.tsx` (show "Grouping edits into topics…" and "Summarizing edits…" from `view.step`; `SummaryTooSoonError` now carries `SUMMARIZE_BUSY_MESSAGE`), and their tests. Eight `timeline-panel.test.tsx` tests fail today because they expect a disabled button and the refresh message; `timeline-panel.test.tsx`, `selection-summary-card.test.tsx`, `selection-summary.test.ts`, `document-page.test.tsx` and `time-travel.test.tsx` fixtures need `step: SummarizeStep.Idle` to typecheck.
- `e2e/timeline.spec.ts` still has "Regroup topics recomputes the names from the current text"; G8 owns it.
- A document with no topic status yet is not stale for the job: the first computation stays with the GET topics `ensure`. A topic set still computing is also not stale.
- A failed regroup does not stop the job: the selection summary and the sentences still run on the previous topics.
- The selection summary only goes stale on a regroup for topic selections, because only they stamp `topicsUpdatedAt`.
- The agent tool `summarize_selection` still calls `selection.request` and keeps its own too-soon message; it does not run the Summarize job.
- No test drives the full browser flow; the tester walks it.
