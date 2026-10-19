# Test plan: Summarize edits with AI: the sentence appears first and grows while it is written

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/insights/summarize-service.test.ts::publishes the selection sentence before the topic sentences are rewritten` — input: the topic sentence call is held; expected: the view is Idle with the sentence while the job still runs.
- [ ] `apps/server/src/insights/summarize-service.test.ts::a selection without a topic regroups while the sentence is written` — input: the regroup call is held; expected: the sentence call has started and landed before the regroup is released.
- [ ] `apps/server/src/insights/selection-summaries-service.test.ts::shows the partial sentence while the model streams` — input: a streaming model held after two words; expected: the view carries the two words as `partial`.
- [ ] `apps/web/src/features/timeline/use-selection-summary.test.ts::a running summary is read again after one second` — expected: the second request is made after 1000 ms.
- [ ] Confirmed each fails for the right reason: the failure text of each red run is in `tester-briefing.md`.

## Unit

- [ ] `summarize-service.test.ts::pin: a selection with a topic regroups before the sentence` — expected: the sentence call starts only after the regroup is released.
- [ ] `selection-summaries-service.test.ts::the final sentence replaces the partial` — expected: `partial` is null and the summary holds the sentence.
- [ ] `selection-summaries-service.test.ts::a stream that breaks clears the partial, saves no half sentence and keeps the last sentence` — expected: `partial` null, the previous sentence kept, the failure line set.
- [ ] `selection-summaries-service.test.ts::a partial never shows for another selection` — expected: the read for a different selection has `partial` null.
- [ ] `selection-summaries-service.test.ts::a timeout stores the timeout line instead of the generic one` — expected: the failure is `SELECTION_SUMMARY_TIMEOUT_MESSAGE`.
- [ ] `llm-client.test.ts::streamStructured rejects with a timeout error when the model is held past the deadline` — input: a 20 ms deadline; expected: `LanguageModelTimeoutError`.
- [ ] `llm-client.test.ts::streamStructured hands each partial sentence to the callback and returns the final output` — expected: a partial that is a beginning of the sentence, then the full output.
- [ ] `use-word-reveal.test.ts`: one word per interval; more words continue from the words shown; the final sentence continues the partial without a jump; a sentence present before any stream shows whole; reduced motion shows the sentence at once.
- [ ] `selection-summary-card.test.tsx::reveals the partial sentence word by word`, `::shows the partial sentence at once under reduced motion`, `::keeps the busy label until the first partial word`, `::the final sentence replaces the partial without hiding the words already shown`, `::a failure keeps the last sentence with the failure line and Retry`.
- [ ] `summarize-service.test.ts::a regroup that rejects while the sentence is written leaves no unhandled rejection and keeps the sentence` — input: the topics compute throws while the sentence call is held; expected: no `unhandledRejection`, the step Idle, the sentence saved.
- [ ] `summarize-service.test.ts::a sentence write that throws beside a rejecting regroup ends the job with no unhandled rejection` — expected: no `unhandledRejection`, the step Idle.
- [ ] `summarize-service.test.ts::a request for another selection while the topic sentences are rewritten starts a job instead of answering Running` — input: the topic sentence call is held after the sentence landed; expected: Started, never Running with an Idle view.
- [ ] `insights-job-runner.test.ts::stopping a watcher leaves a watcher registered after it in place` — expected: only the later watcher fires.
- [ ] `selection-summary-card.test.tsx::the authors sit below the sentence, so a landing sentence never moves` and `::a summarizing step with no grouping before it does not claim the topics are grouped`.
- [ ] Edge: a second click while the job runs — input: POST twice; expected: the second answers Running and the model call count is unchanged.

## E2E (Playwright specs)

- [ ] `e2e/selection-summary.spec.ts::the sentence grows word by word while the slow model streams` — steps: Summarize with the slow streamed marker; expected: the busy label, then the sentence growing word by word, then the final sentence, inside 5 s.

## Prove it for real — Playwright MCP

- [ ] Happy path: edit a document, open the timeline, click Summarize; expected: the busy label, the sentence growing, the topics updating after.
- [ ] Failure: the model fails; expected: the last sentence stays with the failure line and Retry.
- [ ] Reduced motion: expected: the sentence appears whole.
- [ ] Console and network clean.
- [ ] Desktop and narrow width.

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the budget is counted once per real call — attack: count the calls of a parallel Summarize; result: 
- [ ] Claim 2: no partial of another selection shows — attack: change the selection while the job runs; result: 
- [ ] Claim 3: a failed stream saves no half sentence — attack: break the stream after two words; result: 

## Coverage honesty

- A real provider's streaming granularity is not tested; the fake model streams word by word.
