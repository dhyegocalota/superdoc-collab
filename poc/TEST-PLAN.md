# POC — B+ (event-sourcing over the Yjs CRDT) — Test Plan

> Throwaway proof of concept. Goal: prove or refute that document history can be
> captured server-side from SuperDoc v2 collaboration rooms with exact
> attribution, race-condition safety, good performance and a tiny footprint.

## Setup under test

```
 Playwright (headless Chromium)                 Node (single process)
 ┌──────────────┐
 │ author: Ana  │──┐                       ┌──────────────────────────────┐
 │ author: Bruno│──┼──► Chaos WS proxy ───►│ Hocuspocus 2.15.3            │
 │ author: Caio │──┤   (per-author latency,│  onAuthenticate → userId     │
 │ author: Dani │──┘    jitter, cut/heal)  │  onChange      → UpdateLog   │
 └──────────────┘                          │  awareness     → clientId map│
   SuperDoc 2.23.0 (v2 collaboration)      │  node:sqlite (file)          │
                                           └──────────────────────────────┘
```

## Hypotheses and pass criteria

| ID  | Hypothesis | Pass criteria |
|-----|------------|---------------|
| H1  | N SuperDoc v2 clients converge through our Hocuspocus server | 4 authors type unique markers; every client and the server end with identical document text |
| H2  | Every Yjs update can be attributed to an author **exactly** | Each logged update resolves to one author; 100% of each author's markers are attributed to that author and nobody else |
| H3  | Document content is readable server-side from the room `Y.Doc` | Server extracts plain text that equals the text visible in the browsers |
| H4  | The update log is a complete, replayable history | Replaying log `[0..n]` reproduces the exact room state (state vector + text) at every checkpoint |
| H5  | Correctness holds under network chaos | With per-author latency (0/150/600/1500 ms ± jitter), cut/heal cycles, edits while offline and a server restart: H1 + H2 + H4 still pass, zero lost markers |
| H6  | Server-side checkpointing is deterministic and idempotent | Windows cut on idle / author switch / max duration; re-running yields identical checkpoints; overlapping edits produce a `co-edited` window with both authors |
| H7  | A diff between two checkpoints is semantically correct | Inserted / deleted text per window matches what the authors typed / deleted, attributed correctly |
| H8  | Imported DOCX tracked changes are readable with author + date | Node SDK `trackChanges.list()` on a Word-authored DOCX returns author, date and text for each `w:ins` / `w:del` |
| H9  | It is light and fast | Bytes/keystroke, append throughput, replay time for ≥5k updates, diff latency — all reported; replay of 5k updates < 1 s |
| H10 | Concurrent derived computations are race-free | 50 concurrent requests for the same diff compute it exactly once (single-flight) and return identical results |

## Test matrix

| #  | Scenario | Validates |
|----|----------|-----------|
| T1 | 4 authors, no chaos, sequential turns | H1 H2 H3 H6 H7 |
| T2 | 4 authors typing **concurrently** in different paragraphs | H1 H2 H6 (`co-edited`) |
| T3 | 4 authors typing concurrently in the **same** paragraph | H1 H2 H7 |
| T4 | Per-author latency 0 / 150 / 600 / 1500 ms with jitter | H5 |
| T5 | Cut one author, author keeps typing offline, heal | H5 (offline edits attributed to the right author, stamped at server receive time) |
| T6 | Repeated cut/heal flapping on all authors while typing | H5 |
| T7 | Server restart mid-session (persistence on), clients reconnect | H4 H5 (no lost or duplicated updates) |
| T8 | Deletions and replacements | H7 |
| T9 | Replay every checkpoint and compare | H4 |
| T10| Word-authored DOCX with tracked changes via Node SDK | H8 |
| T11| Synthetic load: ≥5k updates, measure | H9 |
| T12| 50 concurrent diff requests | H10 |

### Edge cases (round 2)

| #   | Scenario | Validates |
|-----|----------|-----------|
| E1  | 8 authors, latencies spread 0 → 2000 ms ± jitter, typing concurrently | H1 H2 H5 |
| E2  | Late joiner after history exists | H1 H2 H4 |
| E3  | Same user in two tabs (two Yjs clients, one author); every client gets a declared identity | H2 |
| E4  | Everyone leaves → room unloads → server restarts cold → history survives | H4 |
| E5  | Two authors offline editing the same paragraph, then reconcile | H1 H2 H5 |
| E6  | Two offline authors delete the same text → deleted and attributed exactly once | H2 H7 |
| E7  | New paragraph (split) and paragraph merge attributed to the acting author | H7 |
| E8  | Undo recorded as a deletion by the author who undid | H7 |
| E9  | 5,000-char paste alongside live typing | H2 H7 |
| E10 | Out-of-process server **SIGKILLed** 3× mid-typing | H4 H5 |
| E11 | Reconnect storm: 8 authors drop and return together 5× while typing | H5 |
| U   | Unit: relayed update attribution (provisional → declared), snapshot + tail ≡ full replay at every sequence, idempotent compaction, window rules, single-flight | H2 H4 H6 H10 |

Universal invariant asserted in every E2E: all clients converge, server == clients,
replay == live (state vector), and `Σ inserted − Σ deleted == final − initial length`
(every character accounted for by an attributed event).

## Exit criteria

Every hypothesis is either **PASS** with evidence (test output) or **FAIL** with a
documented reason and a fallback recommendation. The POC stops only when every
row of the matrix has run green or has an explained, accepted failure.
