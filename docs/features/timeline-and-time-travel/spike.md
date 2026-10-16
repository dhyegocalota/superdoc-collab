# Spike (task 0): facts for slice 3

- Date: 2026-10-16
- Versions: `superdoc` 2.23.0, `@hocuspocus/server` and `@hocuspocus/provider` 2.15.3, `yjs` 13.6.33, `better-sqlite3` 13.0.3, `ai` 7.0.142, `@openrouter/ai-sdk-provider` 3.1.0, `zod` 4.6.7, `d3-shape` 3, `react` 19, Node 24.7.0, headless Chromium 156 through Playwright.
- Method: everything lived under an untracked `spike/` at the repo root (own `package.json`, symlinks to the workspace's `yjs`, `superdoc` and Hocuspocus packages so there is one Yjs instance) and was never staged. No product file, `poc/`, manifest or lockfile changed. The real log came from the built product (`apps/server/dist`, port 3200, throwaway database directory) driven by Playwright as Ana with the repo's own `e2e/fixtures.ts` and `e2e/editor.ts` helpers; every server and browser started was stopped.

## 1. Native Yjs snapshots over SuperDoc's room

**Probe.** Upload a three-paragraph seed as Ana, type 285 characters across the three paragraphs, then read the product's `history.sqlite` through `UpdateLog`. Replay the log into `new Y.Doc({ gc: false })`, taking `Y.snapshot(doc)` after 10 pseudo-random sequences plus the last one. For each, `Y.createDocFromSnapshot(doc, snapshot)` against `materialize({ untilSequence })` of the same sequence, comparing `readMainStoryText` and the JSON of the `content` map.

**Evidence (verbatim).**

```
replay gc:false ms 16.6 updates 1033 distinct server_time 332
sequence  textLength  textEqual  contentJsonEqual  snapshotBytes  restoreMs  restoredStateBytes
27        118         true       true              26             3.04       12071
92        129         true       true              92             5.36       40961
123       134         true       true              122            1.23       56554
230       152         true       true              230            2.29       104947
261       157         true       true              260            2.06       120540
389       178         true       true              386            2.57       179480
463       190         true       true              462            8.14       213424
597       213         true       true              597            6.26       276333
903       264         true       true              903            8.33       418410
1028      285         true       true              1029           7.03       475231
1033      285         true       true              1032           6.84       477995
ALL BYTE-IDENTICAL true
gc:false state bytes 482292 gc:true state bytes 477995 ratio 1.009
log bytes 494620
final text equal true 285
```

**Conclusion.** The fact holds. `Y.createDocFromSnapshot` over a `gc: false` replay of SuperDoc's room reproduces `materialize` at every sampled sequence, text and whole `content` map. A snapshot costs about one byte per logged update in this history (1,032 B at 1,033 updates), restoring costs 1 to 8 ms, and `gc: false` costs +0.9% memory here. Caveats: the history is typing only (no mass deletes, which is where `gc: false` retains more); the state is large (about 0.45 MB) because SuperDoc stores per-operation journal entries in the room, so 1,033 updates already weigh 478 KB.

**Consequence for the plan.** Keep ADR 0003 as written and mark it Accepted. `versions.service` holds one `gc: false` doc per active document, restores with `createDocFromSnapshot`, and serves `Y.encodeStateAsUpdate(restored)`. Store the encoded snapshot per version mark (bytes grow with the update count, so a few KB per mark at 10k updates). Add a property test over random sequences comparing the restored text with `materialize`. A delete-heavy fixture belongs in that test because the retention cost was not exercised here.

## 2. A second SuperDoc opens a past version read-only

**Probe.** A throwaway Vite page (`documentMode: 'viewing'`, `roomMode: 'join'`, the document's own DOCX as `data`) and a Hocuspocus 2.15.3 whose `onLoadDocument` applies `Y.encodeStateAsUpdate(restored)` from fact 1, `onAuthenticate` sets `connection.readOnly = true`, and `onChange` and `onStoreDocument` record any write. Sequences 123, 463 and 1033 were opened one after another. A first attempt passed a room name containing the sequence; a second attempt kept the original document id and isolated the version by server.

**Evidence (verbatim).**

```
attempt 1 (documentId "<id>@463", client prefixes sd2/v2.1/):
[SuperDoc] SuperDoc could not load the document editor because the browser worker failed to start. {detail: collaboration story shard f3ac6417-a734-4a18-b743-…document.xml was not seeded by the room authority, ...reason: worker-init-failed}

attempt 2 (documentId = original id, one Hocuspocus per version, readOnly):
{"sequence":123,"expectedLength":134,"domEqual":true,"apiTextEqual":true,"errors":[],"spikeErrors":[]}
{"sequence":463,"expectedLength":190,"domEqual":true,"apiTextEqual":true,"errors":[],"spikeErrors":[]}
{"sequence":1033,"expectedLength":285,"domEqual":true,"apiTextEqual":true,"errors":[],"spikeErrors":[]}
server loaded ['sd2/v2.1/f3ac6417-a734-4a18-b743-c3ff3d633cbf' x3] writes after viewing []
```

The room's maps embed the document id in their keys (`shards`, `content`, `root-op-evidence` keys such as `<id>::story::main:word_document.xml`, plus `meta.roomDocumentId`), and the client builds the room name as `sd2/v2.1/` + `documentId`. A version therefore cannot live in a differently named room without rewriting those keys.

**Conclusion.** The fact holds with one correction to the spec: the ephemeral room is `sd2/v2.1/<documentId>` (the same name as the live room), isolated by the WebSocket endpoint, not by a name with `@<sequence>`. The viewer text equals the text of the version (DOM runs and `doc.getText`), nothing is written, and `readOnly` is honoured.

**Consequence for the plan.** The viewer passes `documentId` unchanged and `serverUrl` points at a version endpoint, for example `/api/documents/:id/versions/:sequence/collaboration`. The server keeps a separate `Hocuspocus` instance per `(documentId, sequence)` created on demand (documents in one instance are keyed by name, so two versions of one document would collide) and destroyed when idle; `onLoadDocument` applies the version state, `onAuthenticate` checks membership and sets `readOnly`, and no `onChange` or `onStoreDocument` is registered. Replace "`sd2/v2.1/<id>@<sequence>`" in the spec's data-flow line. The viewer still needs the document's DOCX as `data` (slice 2 already established that `join` ignores its bytes but requires a non-empty body).

### 2b. Highlighting in the read-only viewer

**Probe.** Searched the public `superdoc` types and the live `superdoc.activeEditor.doc` (`comments`, `trackChanges`, `selection`, `format`, `query`) in `viewing` mode. For each candidate: result, painted DOM, server writes, and what a fresh viewer of the same room sees.

**Evidence (verbatim).**

```
trackChanges: {list,get,decide}            (no create)
format.highlight in viewing: {"success":false,"failure":{"code":"PERMISSION_DENIED","message":"format.highlight is unavailable while the document is in read-only review mode.","details":{"reason":"review-surface-read-only","operation":"format.highlight"}}}
superdoc.search('alpha bravo'): undefined, no DOM change
comments.create({ target, text }) in viewing: {"success":true,"id":"1_564d", ...}
screenshot: the range "alpha bravo" painted with a pink comment highlight, no sidebar
server writes []
SECOND (fresh viewer, same room): {"commentsInFreshViewer":0}
comments.delete({ commentId }): {"success":true,"removed":[...]}  afterDelete painted=0, listAfter=0
```

`doc.query.match(...)` is asynchronous and returns, per match, `target` (a `selection` target) and `highlightRange`; `comments.create` takes `target`, not `ref`.

**Conclusion.** Highlighting works through a temporary comment. `comments.create` succeeds in `viewing` mode, paints the anchored range, never reaches the server (`readOnly`), is absent from a fresh viewer and is removable with `comments.delete`. Formatting (`format.highlight`) and tracked changes are refused or unavailable in `viewing`.

**Consequence for the plan.** `highlight` in `features/editor` finds each edit's range with `doc.query.match` (or the block id and offsets of the event) and creates one comment per range with a fixed text and a recognisable `externalId`; it deletes them on bin change and on leaving the version. Comment text must be empty-looking or localized copy, never user data. Keep `format.highlight` out of the plan. Add a test that a fresh viewer sees no comments and the log has no new rows after highlighting. The "panel lists edits with snippets" fallback stays as a degraded path if SuperDoc changes this.

## 3. Structured output through OpenRouter

**Probe.** A 50-block synthetic contract (block ids `b01` to `b50`; GDPR, SLA, liability, support, pricing plus general clauses), model `openai/gpt-6-luna` through `createOpenRouter(...).chat(model)`, prompt asking for 4 to 8 topics. Three runs, first with `generateObject` and then with `generateText` and `Output.object`, then one per-topic summary call.

**Evidence (verbatim, `generateObject`).**

```
run  latencyMs  topics  blocksAssigned  unknownBlockIds  duplicates  inputTokens  outputTokens  finish
1    5003       7       50              0                0           1326         321           stop
2    4210       7       50              0                0           1326         311           stop
3    4076       7       50              0                0           1326         301           stop
(node) [AISDK_DEP_GENERATE_OBJECT] DeprecationWarning: AI SDK Warning: Deprecated: "generateObject". Use generateText with an output setting instead.
```

**Evidence (verbatim, `generateText` with `Output.object`).**

```
1    4923       7       50              0                0           1326         324          stop
2    4689       7       50              0                0           1326         325          stop
3    4720       7       50              0                0           1326         312          stop
SUMMARY (generateText, Output.object): latencyMs 3142, count 7, topicsInput 7, allIdsKnown true, inputTokens 175, outputTokens 211 (reasoning 43)
SUMMARY (generateObject): latencyMs 3985, count 7, topicsInput 7, allIdsKnown true, inputTokens 173, outputTokens 212, cost 0.0001233
```

**Conclusion.** The fact holds: 4.1 to 5.0 s for topics (under the 10 s budget), a 0.9 s spread across three runs, 7 topics every time (inside 4 to 8), every block assigned exactly once, zero unknown block ids, names varying slightly between runs ("General Terms" versus "Agreement and General Terms"). The summaries call returns one entry per topic id in about 3 to 4 s, at roughly 0.0001 USD. `generateObject` is deprecated in `ai` 7.0.142; `generateText` with `output: Output.object({ schema })` returns `result.output` with the same behaviour. Variance across only three runs and one synthetic document is a weak sample; the topic names are not stable, so the plan must not key anything on names.

**Consequence for the plan.** `llm-client.ts` uses `generateText` with `Output.object`, not `generateObject`. Tests use the mock provider shipped by `ai/test` as `MockLanguageModelV4` (there is no `MockLanguageModelV1` in `ai` 7). Topic identity is the stored `document_topics.id`, never the name; a refresh may rename topics, so the worker maps new topics to old ones by block overlap before reusing colour and summary. Keep the unknown-block-id guard and the "Other" bucket from the spec even though no unknown id appeared. The key is read from the environment only (`scripts/with-env.sh` in local runs).

## 4. Streamgraph performance

**Probe.** A bundled page (esbuild) with React 19 rendering SVG paths from `d3.stack()` using `stackOffsetWiggle` and `stackOrderInsideOut`, 120 bins by 8 series, `area().curve(curveBasis)`, 520 by 240 px. Each iteration builds new data, calls `flushSync(root.render(...))`, then forces layout (`getBoundingClientRect`, `getBBox`) and records `performance.now()` around it; 50 iterations per configuration, repeated twice. Labels, when enabled: for each band, the x of the largest thickness, kept when thickness is at least `MIN_LABEL_HEIGHT` 14 px, rendered as `<text>`.

**Evidence (verbatim).**

```
withoutLabels       { medianMs: 0.9, p95Ms: 2.4, maxMs: 7.1 }
withLabels          { medianMs: 0.8, p95Ms: 1.2, maxMs: 3.1 }
withoutLabelsAgain  { medianMs: 0.7, p95Ms: 1.1, maxMs: 1.4 }
withLabelsAgain     { medianMs: 0.7, p95Ms: 1.1, maxMs: 1.3 }
```

**Conclusion.** The fact holds with a wide margin: median 0.7 to 0.9 ms per data change with or without naive label placement, p95 at most 2.4 ms, worst single iteration 7.1 ms (the first, cold). The measurement covers compute, React commit and forced layout, not paint and composite, and ignores overlap rejection between labels (which adds O(series squared) comparisons, trivial at 8).

**Consequence for the plan.** `MAX_BINS` stays 120 and label placement runs on every data change; no memoisation of placement is needed for performance. Avoid claiming a frame budget beyond what was measured; the Playwright MCP walk checks the real interaction.

## Decisions the plan can rely on

1. Time travel uses native Yjs snapshots: one `gc: false` doc per active document, `Y.createDocFromSnapshot` per version, equal to `materialize` on 11 of 11 sampled sequences (text and `content` map). ADR 0003 moves from Proposed to Accepted. Restore cost 1 to 8 ms; snapshot bytes about one per update; `gc: false` +0.9% on a typing history; add a delete-heavy fixture to the property test.
2. The version viewer is a second `SuperDoc` in `viewing` mode, `roomMode: 'join'`, with the original `documentId` and the document's DOCX as `data`. The room name cannot carry the sequence; isolation is by a per-version WebSocket endpoint backed by one Hocuspocus instance per `(documentId, sequence)`, `readOnly`, with no `onChange` or `onStoreDocument`. The spec's `sd2/v2.1/<id>@<sequence>` is replaced.
3. In-text highlight of the edits of a period is possible in the read-only viewer through temporary comments (`doc.comments.create({ target, text })` then `comments.delete`); they are local, never written to the room and not seen by other viewers. `format.highlight` is refused in `viewing` and tracked changes cannot be created.
4. Topics: `generateText` with `Output.object` (not the deprecated `generateObject`) on `openai/gpt-6-luna` returns the schema reliably at 4 to 5 s for 50 blocks; mocks use `MockLanguageModelV4` from `ai/test`; topic identity is the stored id, not the name.
5. Streamgraph: 120 bins by 8 series renders in under 1 ms median with label placement; no fallback needed.
