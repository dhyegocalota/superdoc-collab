# Tester briefing: Timeline and time travel

Written by the lead after the developer lanes finished. Nobody on the build side ran `test-plan.md` or declares the feature works.

## What changed

- `libs/types/src/timeline.ts`, `constants.ts`, `routes.ts`, `http.ts` — timeline, bin edits, topics, summaries and version contracts; `MAX_BINS`, `BIN_LADDER_MS`, `EVENTS_PAGE_SIZE`, `VERSION_*`, `TOPICS_*` constants.
- `libs/history/src/version-marks.ts`, `version-state.ts`, `read-model.ts` — per-minute version marks committed with the projection, exact version state from a gc:false replay, paged events (`readPage`, `ALL_SEQUENCES`).
- `libs/history/src/timeline/*` — bins (never more than `MAX_BINS`), runs (keystrokes grouped per author, block and bin; deletions matched in Backspace order), words, stacked bands, author fallback bands.
- `libs/history/src/topics/*` — topic schema with bounds, block assignment, topic id reuse only within the same document.
- `apps/server/src/history/*` — projection on a 1.5 s throttle from `onChange` with the store as the final flush, compaction in the worker, a separate import lane, `Version`/`Blocks` worker requests, startup rebuild of documents without marks, timeline pipeline cache per (document, cursor, topic set), paged `/events` (`limit` validated, 400 otherwise), `/timeline`, `/timeline/edits`, `/versions?around` (required), `/versions/:sequence` (202 pending, 200 ready, 503 failed with `Retry-After`), `/versions/:sequence/text`.
- `apps/server/src/collaboration/*` — per-version read-only rooms at `versionCollaborationPath`, member authenticated before any room exists, socket error listener kept during the async authorize window, LRU room eviction and idle close.
- `apps/server/src/insights/*` — topics and per-topic sentences through the Vercel AI SDK and OpenRouter (`openai/gpt-6-luna`), single-flight per document, per-document refresh cooldown with `Retry-After`, recompute only when five new blocks appear, output validated in code (bounded count, known block ids), prompts mark content as data.
- `apps/web/src/features/timeline/*` — panel, filter box (`@person`), streamgraph (hue by onset, saturation by volume), tooltip, Top edits, bin edits, notices (catching up, failed topics, Retry for editors), URL state (`term`, `author`, `topic`, `at`).
- `apps/web/src/features/versions/*`, `features/editor/*` — `?at=` opens a read-only iframe viewer, the live editor is `inert` while viewing, Escape and Back to live exit, arrow keys scrub with a cancellable debounce, highlights as local comments scoped to the run's block with one bounded retry on `editor-update`.
- `e2e/*` — fake OpenRouter, timeline helpers, timeline, filters, time travel, reader and highlight specs; `topics-on-open.spec.ts` pins the empty-first-read bug (fixed on the server after it was committed red).

## How to run

The production-shaped stack from `test-plan.md` (built bundle, `scripts/with-env.sh` for the key, `env` overrides for isolation):

```sh
pnpm build
DIR=$(mktemp -d)
scripts/with-env.sh env PORT=3200 APP_ORIGIN=http://127.0.0.1:3200 AUTH_SECRET=slice-three-test-secret-0123456789abcd DATABASE_DIR=$DIR TRUST_PROXY=false DEMO_PASSWORD=superdoc-demo WEB_DIST_DIR=apps/web/dist node apps/server/dist/seed.js
scripts/with-env.sh env PORT=3200 APP_ORIGIN=http://127.0.0.1:3200 AUTH_SECRET=slice-three-test-secret-0123456789abcd DATABASE_DIR=$DIR TRUST_PROXY=false DEMO_PASSWORD=superdoc-demo WEB_DIST_DIR=apps/web/dist node apps/server/dist/main.js
```

Automated suites: `pnpm typecheck`, `pnpm test:unit` (one skipped test: the OpenRouter smoke without a key), `pnpm test:e2e` (fake OpenRouter, about three minutes, `retries: 0`). The test-only `binMs` query on `/timeline` (any value of `BIN_LADDER_MS`) lets a walk see several bins without waiting whole minutes; the UI never sends it.

## Red today, green after

Every task committed its failing tests alone before its implementation; `git log --oneline main..HEAD` lists the pairs. Names that differ from `test-plan.md`:

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `efdfffa test(web): pin the iframe version viewer, time travel and scrubbing` (plan says "pin time travel, the viewer and scrubbing") | `SuperDoc` constructed twice, viewer modules missing | one live `SuperDoc`, viewer in an iframe |
| `b5db93d test(server): pin the projection throttle, the import lane and version requests` | `projection-throttle` module missing; hanging-import poll times out | throttle module; separate import lane |
| `94cb1c1 test(server): pin exact versions and per-version read-only endpoints` | `/versions/1` 404; `version-rooms` missing | routes and rooms |
| `171e72d test(server): pin topics, summaries and refresh with a mocked model` | `/topics` 404 | insights routes with `MockLanguageModelV4` |
| `325d6c8 test(e2e): pin that topics are named for a document opened right after upload` | first timeline read before the bootstrap projection stored `ready` with no topics | an empty block list never persists `ready`; the next read computes |

Fix rounds after review carry their own `test(...)` commits (`cd91d1f`, `6ddcf9a`, `0720030`, `e69dd28`, `e088cb7`, `14d345c`).

## Hypotheses to attack

1. Hypothesis: a band grows within about 5 s of typing (1.5 s throttle plus the 3 s poll). Break it by: typing continuously for 20 s as two users and timing the first and the last band change; try a document that was just uploaded.
2. Hypothesis: no version request can leave a page that cannot open the document. Break it by: a stranger (`dani@`) with a direct `?at=` link, a revoked share link, a reader after the owner deletes the document mid-viewing.
3. Hypothesis: a version room never writes the log, the identities or the room mode. Break it by: typing in the viewer as the owner and as a reader, then comparing `/events` counts and the live text; reconnecting the viewer socket by toggling the network.
4. Hypothesis: the URL is the source of truth for selection. Break it by: scrubbing with arrow keys and pressing Escape inside 300 ms; Browser Back right after a scrub; pasting an `?at=` for a bin that has no version; an `?at=` far outside the document's span (expect a bounded loading state, not a blank editor — a known gap, report what you see).
5. Hypothesis: topics never appear from another document and refresh is bounded per document. Break it by: two editors clicking Refresh within 30 s (second gets the cooldown message), a reader looking for any Refresh or Retry control, stopping the fake or real provider mid-run and checking the `failed` notice and that a Retry recovers.
6. Hypothesis: highlights appear on every opened version. Break it by: opening a version whose content loads slowly (throttle the network), a bin whose runs are in blocks the version no longer has (no highlight, no error), a version with more than the highlight cap of runs.
7. Hypothesis: the server survives hostile sockets. Break it by: opening the version upgrade with a garbage cookie and resetting the connection immediately, repeatedly; the server must keep answering `/api/health`.

## Known gaps

- Runs split at bin edges; backspaced text shows reversed in snippets.
- Imported revisions months older than the live edits squeeze the live edits into one bin (30 days → 12 h bins by the `MAX_BINS` invariant).
- Documents older than this slice are rebuilt at startup; their versions answer 202 until the rebuild finishes.
- Bins shorter than a minute share the per-minute version; a bin with no version selects locally without writing `at`.
- An `at` outside every bin shows the loading banner indefinitely.
- A failed version request keeps the previously shown version's frame visible under the failure banner.
- SuperDoc 2.23.0 has no local-only comment flag: highlight privacy rests on the read-only version room.
- LRU eviction of version rooms can close another user's viewer when the limit is reached.
- The 150 ms latency budget is asserted locally only; CI asserts one pipeline build per cursor.
- The highlight retry is proven only indirectly in E2E (a highlight exists on first open); comment `externalId`s are not in the DOM.
