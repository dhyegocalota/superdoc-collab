# 0041. The summary card shows the sentence as it is written, through the job and the poll

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: [0012](0012-selection-summaries-cached-per-filter-and-cursor.md), [0031](0031-one-summarize-job-runs-only-what-is-stale.md), the research of 2026-10-18 recorded in [the spec](../features/summarize-wow/spec.md)

## Context

One click on "Summarize edits with AI" could make three model calls in a row, and the card spun until the last one ended, up to about 90 seconds. The sentence call was not streamed, so the reader saw nothing until the whole sentence existed, and the client polled every 3 seconds on top of that.

[0012](0012-selection-summaries-cached-per-filter-and-cursor.md) says a request never waits on the model: the `POST` answers 202 and the client polls. The tool the agent uses to summarize runs the same job and reads the same view.

## Decision

- The job streams the sentence call. The model output is read as it arrives and the partial sentence is kept in memory beside the step, per document, tagged with the selection key it belongs to.
- `GET …/summaries/selection` only reads. While a step runs it returns that partial as `partial` when the key matches the requested selection, and `null` otherwise. The saved row is written once, when the stream ends, so no half sentence is ever stored.
- The partial is dropped when the sentence lands or fails. A failure keeps the last good sentence and stores the failure, as before.
- The client polls every second while a step runs and reveals the partial word by word, so a poll that brings five words reads as five words appearing, not one jump.
- The step returns to Idle and the `summarize:<documentId>` job ends as soon as the sentence is saved, so the next Summarize request starts at once instead of answering Running with an Idle view.
- The regroup of a selection that names no topic, and the rewrite of the topic sentences, run under their own job key `summarize-topics:<documentId>`, started beside the sentence job or after it. A selection with a topic still regroups first, inside the sentence job, because its stamp depends on the topics.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Stream into memory, read by polling (chosen) | keeps 0012; survives a dropped connection; the agent's tool and every browser tab read the same view; no new transport | a poll is at most one second behind; the client smooths the reveal | n/a |
| Server-sent events from the `POST` | words arrive at once | supersedes 0012; a request would hold a connection for up to 30 seconds; a dropped connection loses the stream and the job must outlive it anyway; the agent's tool cannot consume it | the poll already has to exist for a reload and for other tabs |
| Persist the partial in the summary row | survives a restart | a write per chunk or a throttle, a migration, and a half sentence in the table the stale rules read | the job is lost on a restart anyway, so a persisted partial would describe a job that no longer runs |
| Keep generating, only poll faster | smallest change | the sentence still appears whole after the whole call | no wow, no change in the wait |

## Consequences

- A restart during a job loses the partial and the job, as it loses the job today.
- The model call becomes a stream. The one retry covers the request that opens the stream, not a break in the middle; a stream that breaks fails the call and keeps the last sentence.
- The 30 second deadline covers the whole stream, and a timeout has its own failure line.
- The partial is one string per document, so memory is bounded by the sentence cap.
- One Summarize can hold both job slots of the cap in [0011](0011-process-wide-llm-cost-caps.md), the sentence job and the topic job, so a first-time topics compute on another document can answer busy meanwhile. The hourly budget still counts each model call once, and no keyed job is started inside another.

## Evidence

- `apps/server/src/insights/selection-summaries-service.test.ts` pins the partial while the stream is held, its replacement by the final sentence and its removal on a failure.
- `apps/server/src/insights/summarize-service.test.ts` pins the order of the model calls and the step transitions.

## Revisit when

- The agent or the web client needs the words with less than a second of delay.
- The server runs as more than one instance, so the partial is no longer in the process that answers the poll.
- A provider streams in chunks too coarse for a word reveal to look smooth.
