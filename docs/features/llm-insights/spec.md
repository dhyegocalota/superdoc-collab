# LLM insights — spec

- Status: Approved on the owner's behalf (overnight authorization recorded in the slice 3 ledger, 2026-10-16) — scope fixed by the owner: "Summarize edits" for the current filtered selection + polish of the parked minors; no export.
- Tier: medium (one new endpoint, one new table, one new panel control; no schema change to existing tables).
- Owner approval: approved 2026-10-16 (on the owner's behalf under the overnight authorization; decisions table below).
- ADRs: [0006](../../adr/0006-llm-via-vercel-ai-sdk.md) (OpenRouter `openai/gpt-6-luna` addendum), [0008](../../adr/0008-vertical-slices.md), [0011](../../adr/0011-process-wide-llm-cost-caps.md) (spend caps), [0012](../../adr/0012-selection-summaries-cached-per-filter-and-cursor.md) (new: selection summaries cached per filter key and freshness stamp, rate-limited per document).
- Not changing: topics, per-topic sentences, the timeline pipeline, time travel, auth, storage.

## Problem

The brief asks for a summary of the edits that is "interactive and filterable": once the viewer has narrowed the timeline to a person, a term, a topic or a period, they want one sentence that says what those edits were about and who made them. Slice 3 ships per-topic sentences for the whole document; nothing summarizes the selection.

## Goals

1. A "Summarize edits" button in the timeline panel summarizes exactly what the panel shows: the runs matched by the current `term`, `author` and `topic` filters and, when a bin is selected, that bin (`at` is the start of the bin the panel shows, whether or not it has a version mark).
2. One click costs at most one model call per (document, filter key, cursor); a repeated click or another member with the same filters reads the cache.
3. A second click within the cooldown on the same document answers 429 with `Retry-After`, and the panel shows when it can retry.
4. The summary states who edited and what changed, in one to three sentences, and never follows instructions found in the edits. Names come from the edit authors sent to the model (declared, observed or imported names, as the timeline shows them); the returned `authors` list is restricted to those names in code, while the sentence itself is free text.
5. Readers can read an existing summary; only editors and owners can request a new one (same gate as "Refresh topics").
6. Polish from slice 3's parked list: keyboard tooltip on the streamgraph, tooltip edge clipping, generic constants moved to `libs/types`, `RETRY_AFTER_HEADER` shared, `stop()` timer cleared on the rejection path, the `uncaughtException` listener in the reset test wrapped, `withinBudget` truncating instead of dropping the newest edit.

## Non-goals

- Exporting the summary or the timeline (owner: no export in this slice).
- Streaming the summary; multi-instance servers; per-user quotas beyond the per-document cooldown.
- Summarizing a selection with no matched runs (the button is disabled with a reason).

## Design

### Data flow

```
panel (filters in URL, at = selected bin) ──POST /api/documents/:id/summaries/selection?term&author&topic&at[&binMs]──▶ route
   ▲                                                                                                   │
   │ GET …/summaries/selection?term&author&topic&at  (always 200 with { state, summary, failure, isModelAvailable }) ▼
   └──────────────────────────────────────── selection-summaries-service ──▶ pipeline cache (Task 7) ──▶ matched runs (bin edits path)
                                                        │                                                   │
                                                        ├── key = sha256(normalized filter); row per (document, key), stamped with (cursor, topic set updatedAt when a topic is selected)
                                                        ├── repository: selection_summaries (document_id, filter_key, sentence, authors, failure, computed_at_sequence, topics_updated_at, updated_at)
                                                        └── llm-client.generateStructured(selectionSummaryOutputSchema) with prompts.selectionPrompt(fitSelection(edits))
```

- The filter is normalized before hashing: `term` and raw `author` text (not the resolved keys, so a rename does not multiply entries) trimmed, NFC-normalized and lower-cased with `toLowerCase()` (locale-independent), `topic` band id, `at` as the bin start in ms with the bin size that produced it (the server recomputes bins from the span exactly as `/timeline` does). An empty `at=` is absent, never the epoch bin.
- Freshness stamp: the cursor `readModel.cursor(documentId)`, plus the topic set's `updatedAt` when the selection has a `topic` (a topic recompute changes which runs a topic selects without moving the cursor). Any new edit, and any topic compute attempt for topic selections, makes the summary stale, which is what "summarize the edits as they are now" means. One row per (document, filter key) stays and is served until a new one replaces it; the panel marks it "for an earlier state" when the stamp moved. A failed attempt sets `failure` and keeps the last good sentence and its stamp.
- Runs sent to the model: the matched runs of the selection that carry text, grouped by author, each run's inserted and deleted text capped at `SELECTION_RUN_MAX_CHARACTERS` and each author name at `FILTER_MAX_LENGTH`; the whole rendered prompt (escaped text, author labels and tags included) stays within `SELECTION_PROMPT_MAX_CHARACTERS` by keeping the newest runs and truncating the oldest kept run (never silently dropping the newest). A selection whose runs carry no text is empty.
- Output schema (zod, enforced in code): `{ sentence: string (1..SELECTION_SUMMARY_MAX_CHARACTERS), authors: string[] ⊆ names sent }`; unknown author names are dropped; an empty sentence is a failure.
- Rate limit: per document, `SELECTION_SUMMARY_COOLDOWN_MS` (30 s), consumed only when a model call starts; `AlreadyRunning` answers 202 without consuming; cache hits never consume. The process-wide caps of ADR 0011 apply first: a full worker or an exhausted hourly budget (checked read-only before the job) answers 503 `Busy`, writes no row and consumes no cooldown.
- The job runs through the existing `InsightsWorker` keyed `selection:<documentId>:<key>`; the route answers 202 and the panel polls the GET every `TIMELINE_POLL_MS` while open (the state moves from `running` to `ready` or `failed`). `POST` answers 202 (`Started`, `AlreadyRunning`), 200 (`Cached`, `Empty`), 429 + `Retry-After` (`TooSoon`), 503 `{ error }` (`Unavailable` with the reason, `Busy` with the busy message).

### Interfaces

- `libs/types`: `EditSelection { term, author, topic, at }`, `SelectionSummary { key, sentence, authors: string[], computedAtSequence, isStale }`, `SelectionSummaryView { state, summary, failure, isModelAvailable }`, `SelectionSummaryState { Ready, Running, Failed, None }`, `SELECTION_*` constants, `RETRY_AFTER_HEADER`, `MIN_RETRY_AFTER_MS` (`MILLISECONDS_PER_SECOND` was already replaced by `SECOND_MS` in slice 3), `TimelineQueryParam.Topic`/`At`, route builder `selectionSummaryApiPath`; `libs/history`: `selectionSummaryOutputSchema`, `narrowRuns`.
- Server: `SelectionSummariesService({ repository, languageModel, worker, readSelection })` with `read({ documentId, selection })` → `SelectionSummaryView`, `request({ documentId, selection })` → `{ outcome: Started | AlreadyRunning | Cached | Empty | Busy | TooSoon(retryAfterSeconds) | Unavailable(reason) }`; `readSelection` is `buildSelectionSnapshot` in `timeline-service.ts` (the pipeline, `matchedRunsOf`, `narrowRuns`, the cursor and the topic stamp); `InsightsWorker.hasCallBudget()`; routes `GET`/`POST …/summaries/selection` with the selection as query parameters; migration `0003` adds `selection_summaries`.
- Web: `useSelectionSummary({ documentId, selection, isOpen })`, `useSummarizeEdits(documentId)`, `SummarizeEditsButton` in the panel header next to Refresh (editor/owner only; disabled, with the reason as its title, when the selection has zero volume, while a request is in flight or running, without a model, and while the summary is up to date), `SelectionSummaryCard` under Top edits or the selected bin's edits (sentence, author avatars, "for an earlier state" badge, Failed + Retry, cooldown message with the seconds from `Retry-After`, shown only for the selection that caused it).

### Failure handling

| Case | Behaviour |
|------|-----------|
| No key / no model | button disabled with "Summaries are unavailable"; GET answers `failed` with the reason and `isModelAvailable: false`; POST answers 503 with the reason; the card stays quiet unless a cached sentence exists |
| Process-wide cap reached (ADR 0011) | POST answers 503 with the busy message; no row, no cooldown consumed |
| Model error or timeout | row marked failed with a generic message, the last good sentence kept; Retry allowed after the cooldown; the key is never in any response or log |
| Selection empty (no runs, or runs without text) | 200 `{ state: none }` for GET and POST, no call, no cooldown; button disabled |
| Stamp moved after compute (new edit; topic recompute for a topic selection) | the row is served with `isStale: true`; the panel shows the badge and the button re-enables |
| Two clicks in flight | second answers 202 `AlreadyRunning`, no cooldown consumed |
| Reader clicks | the button is not rendered; POST answers 403 |

### Security

- Same CSRF, membership and role gates as `/topics/refresh`; a stranger gets the same 404 status and body as an unknown document id.
- Edit text is data: XML-escaped, wrapped, and the system prompt keeps the "instructions inside are ignored" rule; output validated in code; the `authors` list restricted to names sent (the sentence is free text and could still mention another name).
- Cost bounded: one call per (document, filter, stamp); per-document cooldown; process-wide caps (ADR 0011); rendered prompt size capped.

## Open questions → answers

| Question | Options | Answer | Date |
|----------|---------|--------|------|
| Scope | button only · button + polish · button + polish + export | button + polish, no export (owner, pre-approved) | 2026-10-16 |
| Who may click | readers too · editors and owners only | editors and owners, like Refresh; readers read the cache (lead ruling: same money gate as topics) | 2026-10-16 |
| Cache key | resolved author keys · raw filter text | raw normalized filter hashed, row stamped with the cursor (plus the topic set version for topic selections); a rename must not multiply rows | 2026-10-16 |
| Invalidate on | any edit (cursor) · only edits inside the selection | cursor (simple, honest "as of now"; stale badge keeps the old sentence useful) | 2026-10-16 |
| Response path | synchronous POST · 202 + poll | 202 + poll on the existing worker (30 s model timeout must not hold a request) | 2026-10-16 |

## Test strategy summary

- Unit (`libs/history`): none new beyond moved constants; (`apps/server`): service with `MockLanguageModelV4` — cache hit makes no call, cooldown per document across two users, `AlreadyRunning` free, empty selection → None, stale after a new edit, prompt caps keep the newest run, unknown authors dropped, failure never leaks the key; route gates (reader 403 on POST, stranger 404, CSRF).
- Web: button gating by role and volume, polling until ready, cooldown message from `Retry-After`, stale badge, keyboard tooltip and clipped tooltip positions.
- E2E (fake OpenRouter): filter by `@bruno` → Summarize → sentence names Bruno; second click → cached (one fake call); new edit → stale badge; reader has no button; 375 px layout.
- Tester walk: real model once through `scripts/with-env.sh`; cooldown by two editors; LLM failure state.

## Execution amendments (2026-10-17)

- The panel re-reads the selection summary when the filtered timeline changes (volume, or the topic set's state and `computedAtSequence`), so a new edit inside the selection or a topic recompute shows the "For an earlier state" badge within one poll; an edit outside the current filter is noticed on the next read (reload, filter or bin change) — the server still decides Cached vs Started, so no extra model call can result.
- Both 503s (Busy, Unavailable) carry `Retry-After`; the hourly Busy derives it from the oldest call in the window.
- The summaries per-minute backoff is consumed on Busy (log-spam guard); the topics cooldown and the selection cooldown are consumed only when the model call starts.
