# 0015. Topics: when they are recomputed and how they keep their identity

- Status: Accepted
- Date: 2026-10-17
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the comment audit of 2026-10-17 (rulings recorded only in `docs/features/timeline-and-time-travel/spec.md`), [0011](0011-process-wide-llm-cost-caps.md), PR #6 (`keep ready topics through a busy recompute`)

## Context

Topics are named by the model, and every recompute costs a model call and can rename or reshuffle the bands the reader is looking at. Three rules decide when a recompute happens and what the reader sees afterwards. They were ruled during slice 3 and PR #6 and recorded only in the feature spec, so a reader of `TOPIC_RECOMPUTE_NEW_BLOCKS`, `matchPreviousTopics` or `keepsReadyTopics` had nowhere to find the why.

## Decision

- **Trigger.** A document's topics are recomputed automatically only when at least `TOPIC_RECOMPUTE_NEW_BLOCKS = 5` blocks first seen after the last run sit outside every topic, and at most once per `TOPIC_RECOMPUTE_MIN_INTERVAL_MS` (one minute). Single edits never spend a model call; the manual Refresh does, under its own 30 s cooldown.
- **Identity.** A recomputed topic keeps an earlier topic's id when that earlier topic still holds at least half of the new topic's blocks (`shared * 2 >= needed`); candidates are matched greedily by shared blocks, each earlier id is reused at most once, and anything else is a new topic. Band colours, the highlighted topic in the URL and cached selection summaries keyed by topic therefore survive a recompute when the topic did.
- **Busy recompute.** When an automatic recompute is refused by a process-wide cap ([0011](0011-process-wide-llm-cost-caps.md)) and the document has ready topics, it keeps them and the reader notices nothing. A manual Refresh, or a first computation with nothing to keep, reports `LLM_BUSY_MESSAGE`. This refines the third bullet of ADR 0011, which was written before PR #6.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Recompute on every projected edit | always fresh | one model call per keystroke burst | spend; bands flicker while typing |
| Recompute on a timer regardless of new blocks | predictable | calls with nothing new | the hourly budget is shared by every document |
| New ids on every recompute | trivial | colours, URL topic and summary cache reset on each run | the reader loses their place |
| Any shared block keeps the id | more ids survive | a topic that absorbed one block of another inherits its identity | misleading continuity |
| Busy automatic recompute marks topics failed (ADR 0011 as written) | one rule for every job | the chart loses its bands for a refusal the reader did not cause | the reader is punished for someone else's load |

## Consequences

- `TOPIC_RECOMPUTE_NEW_BLOCKS` lives in `libs/types` and carries an `NB ADR 0015` pointer, as do `keepsReadyTopics` and `matchPreviousTopics`; `TOPIC_RECOMPUTE_MIN_INTERVAL_MS` sits next to the service.
- A document whose new blocks all land inside existing topics is never recomputed automatically; Refresh is the way to re-cluster it.

## Evidence

- `libs/history/src/topics/topic-assignment.test.ts` pins the half-blocks rule and the one-reuse-per-id rule.
- `apps/server/src/insights/topics-service.test.ts` pins the five-block trigger, the interval and the busy behaviour of both paths.

## Revisit when

- The model gets cheap enough that recomputing on every edit burst is acceptable.
- Topics gain a persistent identity from the model itself (for example a stable slug), making the half-blocks heuristic unnecessary.
