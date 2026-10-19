# Tester briefing: Summarize edits with AI: the sentence appears first and grows while it is written

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/server/src/insights/summarize-service.ts` — the step returns to Idle when the selection sentence is saved; a selection without a topic regroups beside the sentence; topic sentences follow.
- `apps/server/src/insights/llm-client.ts` — `streamStructured` (partial output, 30 s deadline, one retry, `LanguageModelTimeoutError`).
- `apps/server/src/insights/selection-summaries-service.ts` — the in-memory partial per document and selection key, cleared when the sentence lands or fails; the timeout failure line.
- `libs/types/src/timeline.ts` — `SelectionSummaryView.partial`, `SUMMARY_RUNNING_POLL_MS`, `SELECTION_SUMMARY_TIMEOUT_MESSAGE`.
- `apps/web/src/features/timeline/` — one-second polling while running, `use-word-reveal.ts`, the card renders the partial and hides the busy label at the first word.
- `e2e/fake-openrouter.ts` — streamed replies as server-sent events, `SLOW-SUMMARY` and `STREAM-SUMMARY` markers.
- `docs/adr/0041-*`, amendments to ADR 0006, 0011, 0012 and the llm-insights spec.

## How to run

The unit files run one at a time from `apps/server` and `apps/web`. The E2E is `e2e/selection-summary.spec.ts`; on a machine where ports 3100 and 3199 are taken, use a scratch config with other ports as `.claude/rules/e2e.md` says. For the walk, insert ` SLOW-SUMMARY STREAM-SUMMARY` as one input event in a paragraph, filter by that author and click Summarize.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `summarize-service.test.ts::publishes the selection sentence before the topic sentences are rewritten` (3eb85914, fix 6a5a2bc1) | `expected { state: 'running', …(4) } to match object { state: 'ready', step: 'idle', …(1) }` | the step is Idle once the sentence is saved |
| `summarize-service.test.ts::a selection without a topic regroups while the sentence is written` (3eb85914, fix 6a5a2bc1) | same text | the regroup starts beside the sentence call |
| `summarize-service.test.ts::pin: a selection with a topic regroups before the sentence` (3eb85914) | pin, green when it landed (its first draft polled too early and was fixed before the commit) | n/a |
| `selection-summaries-service.test.ts::shows the partial sentence while the model streams` (8739c6c9, fix f0bc5d26) | `expected {...} to match object` on `partial` (stub returns null) | the stream is read into the partial |
| `selection-summaries-service.test.ts::a partial never shows for another selection`, `::the final sentence replaces the partial` (8739c6c9, fix f0bc5d26) | `expected null to be 'Bruno added'` | same |
| `selection-summaries-service.test.ts::a stream that breaks clears the partial, saves no half sentence and keeps the last sentence` (8739c6c9, fix f0bc5d26) | `expected { Object (state, summary, ...) } to match object { state: 'failed', …(3) }` (the first write failed on a stream-only model) | the generate path streams |
| `use-selection-summary.test.ts::a running summary is read again after one second` (74fe7941, fix 4d6108f9) | `expected +0 to be 1` | polling uses `SUMMARY_RUNNING_POLL_MS` |
| `use-word-reveal.test.ts` (74fe7941, fix 4d6108f9) | `expected 'Ana raised the budget.' to be ''` | the hook reveals one word per interval |
| `selection-summary-card.test.tsx::reveals the partial sentence word by word`, `::shows the partial sentence at once under reduced motion`, `::keeps the busy label until the first partial word`, `::the final sentence replaces the partial without hiding the words already shown` (74fe7941, fix 4d6108f9) | `Unable to find an element with the text: Ana` | the card renders `view.partial` through the hook |
| `selection-summary-card.test.tsx::a failure keeps the last sentence with the failure line and Retry` (74fe7941) | pin | n/a |
| `llm-client.test.ts::streamStructured rejects with a timeout error when the model is held past the deadline` (ca4dc1a8, fix c7bb9e66) | `expected DOMException{ stack: 'TimeoutError: …' } to be an instance of LanguageModelTimeoutError` | a deadline abort becomes `LanguageModelTimeoutError` |
| `llm-client.test.ts::streamStructured hands each partial sentence to the callback and returns the final output` (ca4dc1a8) | pin | n/a |
| `selection-summaries-service.test.ts::a timeout stores the timeout line instead of the generic one` (ca4dc1a8, fix c7bb9e66) | `expected { Object (state, summary, ...) } to match object { state: 'failed', …(1) }` | the timeout error maps to its own line |
| `e2e/selection-summary.spec.ts::the sentence grows word by word while the slow model streams` (afec109e, fix 940568f1) | `expect(growingSentences.length).toBeGreaterThan(0)`: Expected > 0, Received 0 | the fake streams one word every 400 ms |

## Hypotheses to attack

1. Hypothesis: the card leaves its busy state when the sentence lands, even while the topic sentences are still being rewritten. Break it by: holding the topic sentence call and reading the card.
2. Hypothesis: a selection without a topic spends exactly one call per step, with the cooldown started once. Break it by: counting the fake model calls (`/calls`) for one click.
3. Hypothesis: no partial of another selection shows. Break it by: changing the filter while the slow stream runs.
4. Hypothesis: a stream that breaks saves no half sentence and keeps the last one. Break it by: stopping the fake mid-stream.
5. Hypothesis: reduced motion shows the sentence whole. Break it by: emulating `prefers-reduced-motion` and running the slow stream.
6. Hypothesis: a second click while the job runs answers Running and spends no call. Break it by: double-clicking during the slow reply.

## Known gaps

- A real provider's streaming granularity is not tested; the fake streams word by word.
- Departure from the brief: the partial is kept in memory, not written to the summary row, so there is no migration and no write throttle (`SUMMARY_PARTIAL_WRITE_INTERVAL_MS` was not added). ADR 0041 records why.
- During a parallel regroup the step is Summarizing, so the card can show "Topics grouped" before the grouping has ended for a selection without a topic.
- A grouping failure after the sentence landed shows on the next read only.
- The new E2E ran green on scratch ports 3400 and 3499 together with the four existing specs of its file; the full suite and the Playwright MCP walk were not run by the developer.
