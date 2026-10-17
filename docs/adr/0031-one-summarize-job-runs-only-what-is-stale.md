# 0031. One Summarize job runs only what is stale: topics, then the selection summary, then the topic sentences

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: `docs/features/final-visuals/design.md` section 1.5 and row 7.1, [0011](0011-process-wide-llm-cost-caps.md), [0012](0012-selection-summaries-cached-per-filter-and-cursor.md), [0015](0015-topics-recompute-trigger-and-identity.md)

## Context

Three model jobs exist today. Topics are computed and refreshed with a 30 s cooldown. The per-topic sentences are rewritten automatically when they go stale. The selection summary is requested by a button and has its own 30 s cooldown. Two buttons sit in the panel, one to summarize and one to regroup, and each reports its own busy and cooldown answer.

[0015](0015-topics-recompute-trigger-and-identity.md) says the manual Refresh is the way to re-cluster a document whose new blocks all land inside existing topics. This ADR refines that sentence the way 0015 refined [0011](0011-process-wide-llm-cost-caps.md): the automatic trigger, the identity rule and the busy rule of 0015 stay, and only the manual way to re-cluster changes. The owner rejected keeping two buttons.

## Decision

- One server job per document, started by one `POST` from the one "Summarize edits" button. The job runs three steps in order and runs a step only when it is stale.
- **Topics.** Regroup only when the topic set is older than the newest projected edit, or when the last compute failed.
- **Selection summary.** Write the summary for the selection in the request when it is missing or stale.
- **Topic sentences.** Rewrite them when they are older than the topic set.
- A fresh step is skipped with no model call. A job whose steps are all fresh makes no call and ends as Done.
- Progress is a step enum the client polls: Grouping, Summarizing, Done, and Failed at a step. The card shows "Grouping edits into topics…" and then "Summarizing edits…" from it.
- The job answers busy or cooling down with one message and one retry-after, the longest of the underlying cooldowns.
- A failed regroup keeps the previous ready topics. The busy rule of 0015 stays.
- The automatic topic recompute trigger of 0015 (five new blocks, one minute) stays as it is.
- "Regroup topics" leaves the interface. The Summarize job is the way to re-cluster on demand.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| One job that runs only what is stale (chosen) | no spend on fresh work; bands move only when edits arrived; one busy answer | the server owns an ordered job with step state | n/a |
| Always regroup on every Summarize | simplest rule | a model call per click; bands reshuffle under the reader with no new edits | spend, and the reader loses their place |
| Keep three jobs and chain them in the client | no new server job | three round trips, three error states, and the cooldowns collide | the reader sees the failure of whichever step lost the race |
| Keep two buttons | no change to the panel | two busy messages and two cooldowns for one intent | the owner rejected it |

## Consequences

- The topics, selection summary and sentence cooldowns are consulted together. The retry-after the client shows is the longest one, so a single countdown is honest.
- Topics with no new edits are never re-clustered on demand. A reader who wants new bands must wait for edits or for the automatic trigger.
- The job holds process-wide slots of [0011](0011-process-wide-llm-cost-caps.md) one step at a time, never all three at once.
- The client drops the regroup button, its copy and its separate polling.

## Evidence

Both tests are added by the final-visuals plan.

- `apps/server/src/insights/summarize-job.test.ts` pins the skip rules, the step order and the longest retry-after.
- `apps/web/src/features/timeline/use-summarize.test.ts` pins the step display.

## Revisit when

- Topics gain a stable identity from the model, so regrouping on every Summarize stops reshuffling bands.
- The model gets cheap enough that skipping fresh steps no longer matters.
