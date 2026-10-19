# 0012. Cache selection summaries per filter, stamped with the cursor

- Status: Accepted (pre-approved by the owner, 2026-10-16)
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the take-home brief ("interactive and filterable" summary), [0006](0006-llm-via-vercel-ai-sdk.md), [0011](0011-process-wide-llm-cost-caps.md)

## Context

The brief asks for a summary of the edits that is interactive and filterable. One model call costs money and can take up to 30 s. A selection is the term, author, topic and time cursor the reader has chosen, and the same selection is asked for again and again while the document keeps changing.

## Decision

- The cache key is the raw normalized filter text, hashed with SHA-256. Resolved author keys are not part of the key, so a rename does not multiply rows.
- There is one row per (document, key), stamped with the read-model cursor and, only when a topic is selected, the topic set's `updatedAt`.
- Any edit anywhere marks every selection summary stale. The stale badge keeps the old sentence visible, which is the honest "as of now".
- Any topic compute attempt marks the topic selections stale.
- Summaries run as `202` plus polling on the existing `InsightsWorker`, never as a synchronous `POST`.
- A per-document cooldown, `SELECTION_SUMMARY_COOLDOWN_MS` (30 s), is consumed only when a model call starts.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Key contains the cursor | Never stale | Rows multiply on every edit and the stale sentence is lost | Unbounded growth and an empty panel after each edit |
| Invalidate only edits inside the selection | Fewer stale badges | Needs per-selection run signatures | Cost and complexity outweigh the gain for a demo |
| Synchronous `POST` | One round trip | A 30 s model timeout holds a request open | Requests must not wait on the model |
| Cooldown per user | Fair between editors | Two editors could double the spend | Spend is a document-level cost |

## Consequences

- Any edit anywhere marks every selection summary stale, and any topic compute attempt marks topic selections stale.
- Rows grow with distinct filters, at most one new row per 30 s per document.
- The cooldown is in memory and resets on restart. This is acceptable on a single instance, which is a spec non-goal.
- A selection job holds one of the `LLM_MAX_CONCURRENT_JOBS` (2) process-wide slots for up to 30 s. Two selection jobs on two documents make a first-time topics compute elsewhere fail with the busy message. The per-document cooldown does not bound this across documents. The hourly cap of ADR 0011 does.
- The returned `authors` list is restricted to the names sent, but the sentence is free text. The names sent are the timeline's author names (declared, observed or imported DOCX names), not declared identities only.

## Evidence

- `libs/history/src/timeline/runs.test.ts`: `narrowRuns` keeps the selected band and bin.
- `libs/history/src/topics/topic-schema.test.ts`: the output schema bounds the sentence.

## Revisit when

- The server runs as more than one instance, or the owner wants per-user quotas.

## Amendment 2026-10-18

`InsightsWorker` is now `InsightsJobRunner` and `SELECTION_SUMMARY_COOLDOWN_MS` is now `SUMMARIZE_COOLDOWN_MS`. [0041](0041-the-summary-card-shows-the-sentence-as-it-is-written.md) keeps the rule that a request never waits on the model: the job streams the sentence and the GET returns it as a partial.
