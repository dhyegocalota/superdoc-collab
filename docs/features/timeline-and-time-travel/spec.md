# Timeline and time travel

**Status:** Approved
**Tier:** 🔴
**Owner approval:** approved 2026-10-16
**ADRs:** [0001](../../adr/0001-event-sourcing-over-yjs.md) history capture · [0003](../../adr/0003-time-travel-with-native-yjs-snapshots.md) time travel (Proposed, spike first) · [0006](../../adr/0006-llm-via-vercel-ai-sdk.md) LLM via AI SDK + OpenRouter · [0007](../../adr/0007-read-model-in-sqlite.md) read model · [0008](../../adr/0008-vertical-slices.md) slices (addendum: topics in slice 3) · [0009](../../adr/0009-design-system.md) design system
**Not changing:** documents, sharing, authentication, the collaboration socket and the update log from slices 1–2; `poc/` untouched; no "Summarize edits" button (slice 4); no deployment (slice 5).

## Problem

The product's promise is the panel at the bottom of the brief's mock: a streamgraph whose bands are the document's topics, a box to filter by term or username, and a "Top edits summary" that names, per topic, who contributed, how much, and what the edits were about. Slice 2 recorded every edit with its author; nothing shows it yet. This slice renders that history, lets the reader filter it, and lets them travel to any moment of the document.

## Goals

1. **Streamgraph** of edit volume over time, one band per **topic**, labels inside the bands, built with d3-shape (`stackOffsetWiggle`, `stackOrderInsideOut`, `curveBasis`) and rendered as React SVG. Hover shows the topic, bin, volume and contributors; click (or drag) selects a moment for time travel.
2. **Topics** produced by the LLM once per document: 4–8 named topics, each owning a set of block ids; every edit event joins its topic through its `blockId`; events on blocks without a topic fall into "Other" until a recompute. Recompute when ≥ `TOPIC_RECOMPUTE_NEW_BLOCKS` new blocks lack a topic, when the owner clicks "Refresh topics", and on first open.
3. **Filter by term or username**: one box; a term matches inserted or deleted text (case-insensitive substring), a username matches an author's name or email; both narrow the chart, the panel and the version highlights; the state lives in the URL (`?term=…&author=…&at=…`) so a view is shareable.
4. **Top edits summary**: per topic (sorted by volume), the topic chip in its band colour, avatars of the top three contributors, `+N words −M words`, and a one-sentence LLM summary of that topic's edits, cached and recomputed only when the topic received new edits since the last summary.
5. **Time travel (ADR 0003)**: choosing a moment opens the document **as it was then**, read-only, in the editor area with a banner ("Version at 14:02 · back to live"), the edits of the selected bin listed in the panel and highlighted in the viewer where the spike proves it possible; dragging across the chart scrubs between versions with a debounce.
6. **Live**: the chart and panel update while people edit (projection scheduled on a throttle from `onChange`, not only from the store; `/events` paginated by cursor), so the demo shows bands growing as a second author types.
7. **Spike first** (Task 0): the four facts below, recorded in `spike.md`; a failure narrows this spec.

## Non-goals

"Summarize edits" on demand, dark-mode polish, email digests, exporting the chart, formatting-only history, comments as events, multi-instance servers.

## Design

### Layout and why

The side panel reserved in slice 2 becomes the timeline panel: resizable (`MIN_PANEL_WIDTH` 420 px, default 40% of the viewport), with the chart on top (height 240 px), the filter box, and the Top edits list below; under 1024 px the panel stacks below the editor at full width. The brief's mock docks the chart at the bottom; the owner chose the side panel in slice 2 and the resizable width keeps the streamgraph wide enough — **owner can override at approval** (bottom dock would cost a layout switch and a second chart size).

```
libs/history/src/
  timeline/        bins.ts (bin size from span, bucket events), stack.ts (series per topic), words.ts (word counts)
  topics/          topic-assignment.ts (blockId → topicId join, "Other"), topic-schema.ts (zod for the LLM output)
apps/server/src/
  insights/        llm-client.ts (AI SDK + OpenRouter), topics.service.ts, summaries.service.ts, insights.routes.ts, insights.worker.ts (LLM calls off the request path)
  history/         versions.service.ts (native Yjs snapshots, LRU), versions.routes.ts, projection trigger from onChange (throttle)
  database/schema/ insights.ts (document_topics, topic_blocks, topic_summaries, version_marks)
apps/web/src/features/timeline/
  timeline-panel, streamgraph (svg), band-label, tooltip, filter-box, top-edits, topic-chip, contributor-avatars
  use-timeline (query + URL state), use-topics, use-time-travel
apps/web/src/features/editor/   version-banner, version-viewer (second read-only SuperDoc), highlight (spike-dependent)
e2e/                timeline.spec.ts, time-travel.spec.ts
```

### Data flow

```
edit_events ─► GET /api/documents/:id/timeline?term&author&binMs ─► { bins: [{ start, byTopic: { topicId: { inserted, deleted, words } } }], topics, contributorsByTopic }
                 (SQL GROUP BY bin × topic, join topic_blocks; bin size chosen server-side from the span: 1 min … 1 h, 60–120 bins)
topics      ─► insights.worker: text of the document (blocks) → generateObject(schema: { topics: [{ name, blockIds[] }] }) → document_topics + topic_blocks (computed_at_sequence)
summaries   ─► insights.worker: per topic with new edits since last summary: generateObject({ summaries: [{ topicId, sentence }] }) in ONE call → topic_summaries
versions    ─► GET /api/documents/:id/versions/:sequence → state bytes (gc:false Y.Doc in memory per document, Y.createDocFromSnapshot at the nearest version mark, LRU of N versions, cold ones in the projection worker)
viewer      ─► second SuperDoc (read-only, documentMode viewing) opened from the version bytes in an ephemeral room `sd2/v2.1/<documentId>@<sequence>` (server loads the state, no log, no membership writes) — or directly from a DOCX export of the version if the spike shows SuperDoc cannot open from state
live        ─► onChange throttle (PROJECTION_THROTTLE_MS 1500) → scheduler.request → projection → web polls /timeline every 3 s while the panel is open (or on a lightweight SSE `/api/documents/:id/history-stream`; decided in the spike by cost)
```

### Interfaces

- `GET /api/documents/:id/timeline?term&author&binMs` (member) → bins, topics (`{ id, name, color: { hue, onsetSequence }, volume }`), contributors per topic (`{ user, inserted, deleted, words }`).
- `GET /api/documents/:id/events?afterSequence&limit` (paginated now; `limit` ≤ `EVENTS_PAGE_SIZE`).
- `GET /api/documents/:id/topics` · `POST /api/documents/:id/topics/refresh` (owner or editor; rate-limited to one in-flight per document) → 202 while computing, state `pending | ready | failed`.
- `GET /api/documents/:id/summaries` → `{ topicId, sentence, computedAtSequence }[]`.
- `GET /api/documents/:id/versions?around=<sequence>` → the version marks near a moment; `GET …/versions/:sequence` → version state; `GET …/versions/:sequence/edits?binMs` → the events of that bin (for highlights and the panel).
- Enums in `libs/types`: `TopicState { Pending, Ready, Failed }`, `TimelineFilterKind { Term, Author }`, `VersionViewerState { Live, Viewing }`.
- Environment: `OPENROUTER_API_KEY` (required when `LLM_MODEL` is set; without it topics are `Failed` with a visible message and the chart falls back to one band per author — explicit fallback shown in the UI, never silent), `LLM_MODEL` (default-free: documented in `.env.example` as `openai/gpt-6-luna`).

### Streamgraph rules (Byron & Wattenberg, applied)

- Baseline `stackOffsetWiggle` (weighted wiggle), order `stackOrderInsideOut` (topics by onset; bursts in the middle), `curveBasis` smoothing; bins chosen so that the silhouette is neither flat nor spiky (60–120 bins).
- Colour: hue by onset order of the topic (cool → warm), saturation by the topic's total volume; authors keep stable colours for avatars and cursors (slice 2 members list) — topics and authors never share a palette.
- Labels inside bands when the band is at least `MIN_LABEL_HEIGHT` px tall at some x; otherwise the label appears on hover and in the legend; labels never overlap each other or leave their band.
- Accessibility: the SVG carries a title and a description; every band is focusable (`tabindex`, `aria-label` with topic and volume); arrow keys move the selected bin; the panel list mirrors the chart so nothing is only visual.

### Spike (Task 0) — facts to confirm

| Fact | Why | If false |
|---|---|---|
| `Y.createDocFromSnapshot` over a gc:false replay of SuperDoc's room reproduces the room at a past sequence, and a second SuperDoc can open it read-only from the server-provided state in an ephemeral room | time travel (ADR 0003) | fall back to materializing the full state per version from the log (slower, bounded by snapshot + tail) and, if SuperDoc refuses state-only rooms, export a DOCX of the version with the SDK and open it as a plain document |
| A range in the read-only viewer can be visually highlighted (temporary tracked change, comment, or selection) | "edits of the period highlighted" | the panel lists the edits with text snippets and the viewer shows the version without in-text highlight |
| `generateObject` through `@openrouter/ai-sdk-provider` with `openai/gpt-6-luna` returns the topic schema reliably on a 50-block document in < 10 s | topics | switch model (`LLM_MODEL`) or fall back to `generateText` + zod parse with one retry |
| d3 streamgraph with 120 bins × 8 topics renders and re-renders under 16 ms with label placement | live chart | lower `MAX_BINS` or compute label placement once per data change |

### Failure handling

| Failure | Behaviour |
|---|---|
| No `OPENROUTER_API_KEY` or LLM error | topics `Failed` with the message in the panel; chart shows one band per author with a notice "Topics unavailable"; retry button for owners/editors |
| LLM returns topics that reference unknown block ids | ignored blocks logged once; topics still saved; unassigned blocks go to "Other" |
| Projection behind (degraded worker) | panel shows "History is catching up" with the cursor age; chart renders what exists |
| Version not in cache and worker busy | 202 with `Retry-After`; viewer shows a progress state, never a blank editor |
| Filter matches nothing | empty chart with "No edits match" and a clear-filter action |
| Scrubbing faster than versions load | debounce 300 ms; the banner shows the requested time while the previous version stays visible |

### Security

Every new route checks membership (reader allowed to read everything in this slice); LLM prompts contain only the document's own text and edits, never other documents or user emails (names only); the key never leaves the server; version rooms are ephemeral, read-only, membership-checked and never write to the log; `POST /topics/refresh` is rate-limited per document and per user.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Bands | authors now, topics later · sections · topics now | topics now (LLM pulled into slice 3) | 2026-10-16 |
| Topic production | document topics + block join · per-window classification · hybrid | document topics + block join | 2026-10-16 |
| LLM boundary 3/4 | topics + per-topic sentence in 3 · only topics in 3 · everything in 3 | topics + per-topic sentence in 3; "Summarize edits" in 4 | 2026-10-16 |
| Provider | Anthropic · Gemini · OpenAI · none | OpenRouter with `openai/gpt-6-luna` (key from the owner's other project; ADR 0006 addendum) | 2026-10-16 |
| Palette | hue by onset + saturation by volume · fixed categorical · monochrome | hue by onset, saturation by volume | 2026-10-16 |
| Time travel | diff overlay · time travel · both | time travel, read-only viewer, performant (slice 1 brainstorm) | 2026-10-16 |
| Panel placement | side (resizable) · bottom dock | **advisor's choice, owner can override:** side panel, resizable, stacks below under 1024 px | 2026-10-16 |
| Bin size | fixed · chosen from the history span | **advisor:** chosen from the span (1 min … 1 h), 60–120 bins, exposed as `binMs` for tests | 2026-10-16 |
| Band value | characters · words · events | **advisor:** characters inserted + deleted (what the editor sees); the panel reports words | 2026-10-16 |
| Live updates | polling · SSE | **advisor:** decided in the spike by cost; polling every 3 s is the fallback | 2026-10-16 |

## Test strategy summary

- Unit (`libs/history`): bin sizing for spans from 2 min to 30 days; stacking input shape; word counts; topic assignment with unknown blocks → "Other"; zod schemas for the LLM outputs (reject a topic without blocks, duplicate names).
- Server integration: `/timeline` filters (term, author) and bins; `/events` pagination; topics state machine with a **mocked AI SDK provider** (`MockLanguageModelV1` from `ai/test`) returning fixtures, including malformed output; summaries recomputed only on new edits; versions route serves a past sequence equal to a full replay (property test over random sequences); ephemeral rooms never write to the log; membership on every route.
- One real-LLM smoke test behind `OPENROUTER_API_KEY` (skipped when absent) that names topics for the seed document and asserts the schema, not the words.
- E2E: two authors type in two topics → bands appear within ~5 s; filter by username hides the other author; filter by term; click a bin → version banner shows the time and the viewer text equals the text at that sequence (asserted through `/versions/:sequence/text`); back to live; keyboard navigation of the chart; narrow viewport stacks the panel.
- Playwright MCP walk (tester): the whole flow with three users, topics refresh, LLM failure state (key removed), scrubbing, 375 px; console and network clean.
- Spike report in `spike.md`.
