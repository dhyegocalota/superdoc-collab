# Summarize edits with AI: the sentence appears first and grows while it is written

**Status:** Building
**Lane:** product
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 (the owner asked to make "Summarize edits with AI" more resilient and faster, with a wow effect; the options below were chosen from the research)
**ADRs:** [0041](../../adr/0041-the-summary-card-shows-the-sentence-as-it-is-written.md), [0012](../../adr/0012-selection-summaries-cached-per-filter-and-cursor.md), [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md), [0011](../../adr/0011-process-wide-llm-cost-caps.md)
**Not changing:** the cooldown and the hourly budget rules (a call is counted once, where it starts); one `summarize` job per document, with the topic work under its own key; the stale rules of ADR 0031; the agent's summarize tool and its `SummaryOnly` scope; the selection summary cache key and its stamp; the database schema.

## Problem

One click on "Summarize edits with AI" can make three model calls in a row: the regroup of the topics, the selection sentence and the topic sentences. The step returns to Idle only after all three, so the card spins for up to about 90 seconds when the reader only waits for the second call. The client polls every 3 seconds, so even a fast sentence appears up to 3 seconds late. The call itself is not streamed, so the reader sees nothing until the whole sentence exists. The fake model used by the E2E suite answers instantly, so no test has ever seen the latency.

A failure already keeps the last good sentence visible. A timeout of 30 seconds reads like any other failure.

## Goals

- The selection sentence is published as soon as it is written. The card leaves its busy state at that moment, and the topic sentences are rewritten afterwards in the same job.
- A selection that names no topic regroups at the same time as it writes the sentence, because its stamp ignores the topics. A selection that names a topic still regroups first.
- The sentence shows while it is written: the job streams the model output and the card reveals the partial sentence word by word.
- The card polls every second while a step runs.
- A model failure keeps the last good sentence, shows the failure line under it and offers Retry. A timeout has its own line.
- One E2E sees the busy label, then the partial words growing, then the final sentence.

## Non-goals

- No server-sent events or WebSocket for the summary (ADR 0041 records why).
- No change to the Summarize button, its enabling rules or the cooldown copy.
- No new model call, no new model and no change to the prompts.
- The topic sentences are not streamed.

## Design

### Data flow

1. `POST …/summaries/selection` starts the keyed job `summarize:<documentId>` and answers 202, as today.
2. A selection with a topic regroups first, inside the `summarize:<documentId>` job. A selection without a topic starts the sentence at once, and its regroup runs beside it under the `summarize-topics:<documentId>` job.
3. The sentence step streams the model output. The service keeps the partial sentence in memory, per document and selection key, and replaces it with the saved row when the stream ends.
4. When the sentence is saved, or has failed, the step becomes Idle, the partial is dropped and the `summarize` job ends. The stale topic sentences are rewritten under `summarize-topics:<documentId>`, so another Summarize can start meanwhile; the cooldown and the hourly budget still apply.
5. `GET …/summaries/selection` only reads. While a step runs it returns the partial sentence of its own selection; no request waits on the model (ADR 0012).
6. The client polls the GET every second while the view is running and renders the partial sentence word by word. The saved sentence replaces it.

### Interfaces

- `libs/types`: `SelectionSummaryView.partial: string | null`; `SUMMARY_RUNNING_POLL_MS` (1 s); `SELECTION_SUMMARY_TIMEOUT_MESSAGE`.
- `llm-client.ts`: `streamStructured` beside `generateStructured`, with the same timeout and one retry, yielding partial output through a callback; a timeout rejects with `LanguageModelTimeoutError`. The test language models answer a stream by replaying their generate answer, so existing call counts stay valid.
- `SelectionSummariesService`: keeps the partial per document, clears it when the sentence lands or fails.
- Web: `useSelectionSummary` polls with `SUMMARY_RUNNING_POLL_MS`; the card renders `view.partial` through a `useWordReveal` hook that honours `prefers-reduced-motion`.
- `e2e/fake-openrouter.ts`: the markers `SLOW-SUMMARY` (a delay per request) and `STREAM-SUMMARY` (a streamed reply that sends the sentence word by word).

### Failure handling

| Case | Behaviour |
|------|-----------|
| The sentence call fails | The row keeps the last good sentence, stores the failure, the partial is cleared, the card shows the sentence, the failure line under it and Retry. |
| The sentence call times out after 30 s | Same, with the line "The model took too long. Try again." |
| The regroup fails beside the sentence | The sentence lands; the grouping failure shows from the next read, as today. |
| A second click while the job runs | The answer is Running and costs no call. |
| The regroup beside the sentence rejects, or the sentence step throws | The two run as separate keyed jobs, each with its own handler, so no rejection is left unhandled; the sentence still lands when its call succeeds and the step returns to Idle. |
| The stream breaks half-way | The partial is dropped and the failure rules above apply; no half sentence is saved. |

## Known gaps

- A grouping failure that happens after the sentence landed shows only on the next read; the client has stopped polling by then and reads again when the timeline changes or the reader acts.
- The partial lives in memory. A restart during a job loses it, and the job itself is lost as today.
- The card shows "Topics grouped" only when it saw the Grouping step before Summarizing, so a selection without a topic never claims it. A reload in the middle of a topic selection's Summarizing step shows no grouped line.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| How does the sentence reach the card while it is written? | polling a partial the job writes; server-sent events | polling; ADR 0012 stands | 2026-10-18 |
| Should the topic sentences be part of the busy state? | yes; no | no, the reader waits only for the sentence | 2026-10-18 |

## Test strategy summary

Unit tests with the gated and streaming language models for the order of calls, the step transitions, the partial and the failure; card and hook tests with fake timers; one E2E with a slow streamed fake model.
