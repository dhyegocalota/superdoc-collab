# POC — B+ results

> Throwaway proof of concept. Stack: SuperDoc 2.23.0 (v2 collaboration) ·
> Hocuspocus 2.15.3 · Yjs 13.6 · `node:sqlite` · Playwright (headless Chromium) ·
> Vitest. Plan: [TEST-PLAN.md](./TEST-PLAN.md).

## Verdict

**B+ is viable.** Every hypothesis passed. The final suite (**14 unit + 20 E2E**)
ran green twice in a row after the last change. Across the rounds, T7 ran green
20 times in a row, and E10 survived 9 SIGKILLs of the server mid-typing with
exact history.

| ID  | Hypothesis | Result | Evidence |
|-----|------------|--------|----------|
| H1  | N clients converge | ✅ PASS | T1–T8, T11: 4 authors, identical text on every client and on the server |
| H2  | Exact attribution | ✅ PASS | Every author's history equals exactly what they typed, in order, even with character-level interleaving in the same paragraph (T3) |
| H3  | Content readable server-side | ✅ PASS | The room `Y.Doc` exposes `content[<story>].blocks[] = { blockId, text }`; the server reads plain text without the engine |
| H4  | Log is a complete history | ✅ PASS | Replaying the log reproduces the live room byte-for-byte (state vector + text) in every scenario |
| H5  | Correct under chaos | ✅ PASS | Latency 0/150/600/1500 ms ± jitter (T4), offline typing (T5), cut/heal flapping (T6), 3 s server outage mid-typing (T7): zero lost, duplicated or misattributed characters; 0 relayed updates |
| H6  | Deterministic windows | ✅ PASS | Re-projecting from a reopened database yields identical events and windows; unit tests cover idle, max-duration, hand-off and co-edit rules |
| H7  | Diff is semantically correct | ✅ PASS | Insertions, backspace deletions and selection replacements attributed to the acting author (T8) |
| H8  | Imported Word revisions | ✅ PASS | `@superdoc/sdk` `trackChanges.list()` returns author, ISO date, inserted/deleted text, `imported: true` and the same `blockId` scheme as the room (T10) |
| H9  | Light and fast | ✅ PASS | See below |
| H10 | Race-free derived computations | ✅ PASS | 50 concurrent requests → 1 computation, identical results (T12) |

### Edge cases (round 2)

| #   | Scenario | Result |
|-----|----------|--------|
| E1  | 8 authors, latency 0 → 2000 ms ± jitter | ✅ |
| E2  | Late joiner | ✅ sees the full history; attributed correctly |
| E3  | Same user, two tabs | ✅ 2 Yjs clients → 1 author; every connected client gets a `declared` identity, including clients that never edited |
| E4  | Room unload + cold server restart | ✅ restored from snapshot + tail |
| E5  | Two offline authors, same paragraph | ✅ |
| E6  | Two offline authors delete the same text | ✅ deleted once and attributed to exactly one of them; the other's delete is a no-op |
| E7  | Paragraph split / merge | ✅ split → `created`; merge → `merged` (content-neutral) |
| E8  | Undo | ✅ recorded as the undoer's deletion |
| E9  | 5,000-char paste + live typing | ✅ |
| E10 | SIGKILL × 3 mid-typing (out-of-process server) | ✅ 0 lost, 0 duplicated, 0 relayed |
| E11 | 8-author reconnect storm × 5 | ✅ |

## How it works

```
Hocuspocus onChange(update, connection)          ← serialized per document
  └─► UpdateLog.append(seq, connectionUserId, structClientIds, serverTime, bytes)
        └─► client_identities: Yjs clientId → user, bound on first sighting
Projection (pure, replayable):
  apply update n → read content blocks → diff vs n-1 → EditEvent{author, blockId, inserted, deleted}
Windows (pure): group events by idle gap / max duration / author hand-off / co-edit
```

Attribution comes from the **Yjs struct clientIds** inside each update. Each
clientId is bound to a user in two tiers:

- **declared**: authoritative. The owner's awareness state is announced on its own
  authenticated socket, via Hocuspocus `connection.clients`. That awareness
  `clientId` is the same id as the content `Y.Doc` clientID; E3 verified this.
- **observed**: provisional. The connection that first sent structs for that
  clientId.

A declaration overrides an observation, and never another declaration. This
closes the relay hole: the server crashes after broadcasting Ana's update but
before persisting it, then Bruno re-sends Ana's structs. Unit tests force that
scenario deterministically. In the chaos runs, including 9 SIGKILLs, 0 relayed
updates were observed.

History is restored by **snapshot + tail**:

- A compacted state is written every 1,000 updates in `onStoreDocument`, through
  an idempotent `INSERT OR IGNORE`.
- Snapshot + tail is proven equivalent to a full replay at every sequence.

## Performance (T11: 204-paragraph document, 4 authors typing 400 characters each, concurrently)

| Metric | Value |
|--------|-------|
| Updates | 9,619 (6.0 per keystroke) |
| Log size | 4.6 MB, **2.9 KB per keystroke** |
| SuperDoc's own compacted room state | 4.45 MB |
| Update size p50 / p95 | 104 B / 1.7 KB |
| Full replay (no snapshots) | ~900 ms, grows with history |
| **Snapshot + tail replay** | **~95 ms**, bounded by the tail |
| Event projection | 0.13 ms per update |
| Append throughput | ~33k updates/s |

The SuperDoc v2 room grows about 2.8 KB per keystroke **by itself**, because its
operation journal (`operations`, `root-op-evidence`) is retained in the `Y.Doc`.
Our log costs only about 3% more than the room it mirrors. Snapshots are already
in place, so replay is O(tail). For production, also persist the projected
`EditEvent`s incrementally; they are tiny.

## Findings worth sharing with the SuperDoc team

1. **The room is an operation journal, not a ProseMirror XML fragment.**
   Top-level maps: `meta`, `package`, `operations`, `checkpoints`, `shards`,
   `content`, `root-op-evidence`.
   - Each `tx-*` carries `createdByClient` and `createdAtMs`.
   - `author` is always `headless-kernel`, so identity must come from the transport.
2. **`@hocuspocus/server`'s exported `Server` is a singleton.** Multiple
   instances in one process must use `new Hocuspocus(...)`.
3. **Focus loss on click under concurrent remote edits.**
   - What happens: about 1 in 10 runs during a reconnect storm, clicking a text
     run did not focus the editor's hidden `textarea`, and keystrokes went to
     `BODY`.
   - Effect on data: nothing reached the document, so the history was still
     consistent.
   - How the harness handles it: it now verifies focus like a human would, and
     records every recovery.
4. **The caret occasionally lands out of order under fast concurrent typing.**
   - What happens: about 1 in 15 runs, one keystroke landed at the wrong offset
     (`<ANAPRE>-`).
   - Effect on data: every client still converged, and the history recorded the
     keystrokes in typed order.
5. **Keyboard paragraph merge was a no-op in our collaborative setup.**
   - Backspace at a paragraph start did not merge, and neither did Delete at a
     paragraph end.
   - `doc.blocks.merge()` works. The merge is stored as a tombstone: the merged
     block keeps its text and gets `mergedIntoBlockId`.
   - A split is stored as `splitFromBlockId` on the new block.
6. **Hocuspocus `onAwarenessUpdate` receives the *document's* creation context,
   not the sender's.** Use `document.connections[*].clients` to tie awareness
   clientIds to the socket that declared them.
7. **`onCollaborationConnectionChange` reported `synced → degraded → degraded`
   across a restart and never reported a recovery state, even though sync
   resumed.**

## Not covered by this POC

- Formatting-only changes (bold, styles), tables, headers and footers. The
  projector reads only the main story's paragraph text.
- Comments as contribution events.
- Multi-instance servers.

## Run

```bash
pnpm install
pnpm typecheck
pnpm test:unit   # vitest — windows, single-flight, relay attribution, snapshots, Word revisions via Node SDK
pnpm test:e2e    # playwright — builds the client, spins up server + chaos proxy per test
```
