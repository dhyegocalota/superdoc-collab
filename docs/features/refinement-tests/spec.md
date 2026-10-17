# Refinement: tests

**Status:** Approved
**Tier:** 🟢 small (tests only, plus one invisible `data-faded` attribute; no behaviour, schema, endpoint or dependency change)
**Owner approval:** approved 2026-10-17 (refinement proposal)
**ADRs:** [0001](../../adr/0001-event-sourcing-over-yjs.md) (gets a one-line addendum: the window grouping is gone)
**Not changing:** product behaviour; the projection-scheduler test "a document projected before marks existed is rebuilt at startup"; the failed-summary E2E (already stabilized in PR #7); the 11 web tests that mix `shouldAdvanceTime` fake timers with the real clock; the per-case `test.each` suites that start one server per row; the untracked scratch specs `e2e/_walk-minors.spec.ts` and `e2e/_audit-ux.spec.ts` (they are not in the repository and must never be committed).

Lane D of the 2026-10-17 refinement. It lands after lane B (structure), so every path below is the path after lane B: `apps/server/src/repository-shape/` (was `deploy/`, now with `repository-files.ts`), `apps/web/src/testing/` (was `test/`, alias `@/testing/`), `apps/web/src/features/versions/time-travel.test.tsx` (was `features/editor/`).

## Problem

A read-only audit of the 742 tracked tests (audit-tests, 2026-10-17) found tests that pay CI time without guarding anything a sibling does not already guard:

- Twenty repository-prose tests grep the README, the runbook, the test plan and the CI YAML for wording. Each was the red half of its own docs commit and none caught a later break.
- Service tests duplicate their route twins one for one, and route tests duplicate the pure library tests underneath them. Every server test starts a real server (4 to 6 s in CI).
- Two library modules (`edit-windows`, `single-flight`) have no production caller; only their tests use them.
- A few tests assert Tailwind class strings, constants equal to themselves, or a TypeScript shape `pnpm typecheck` already enforces.
- Four tests wait real seconds (10 s idle socket, 14 s eight-minute replay, a 4 s config echo that proves nothing, a timer-spy pairing) where a bounded or outcome assertion is available.
- Ten E2E walks repeat a scenario another walk or a unit test already covers; the cooldown walk waits the real 30 s cooldown (45 s per run).

## Goals

1. Remove 84 tracked tests (from 742 to 658) with no loss of guarded behaviour: every removed test is either dropped for a stated reason or folded into a named surviving test that carries its assertion.
2. Rewrite 9 tests so they assert behaviour through roles, ARIA, data attributes or outcomes instead of class strings, constants or real multi-second waits.
3. Delete `libs/history/src/{edit-windows,single-flight}.ts` with their tests and record it in ADR 0001.
4. Cut roughly 2.5 minutes from each CI run (E2E alone from about 9.6 to about 7 minutes).

| Package | Before | After | Removed |
|---|---|---|---|
| libs/types | 13 | 7 | 6 |
| libs/history | 80 | 72 | 8 |
| apps/server | 383 passed + 2 skipped | 336 passed + 2 skipped | 47 |
| apps/web | 218 | 205 | 13 |
| E2E (Playwright) | 48 | 38 | 10 |
| **Total** | **742** | **658** | **84** |

Counts are runtime tests (`test.each` rows expanded), as Vitest and `playwright test --list` report them. The two skipped server tests are the OpenRouter smoke tests and stay skipped without a key.

## Non-goals

- New tests for gaps the audit found (none are claimed here).
- Stabilizing the 11 `shouldAdvanceTime` web tests (separate fix if they flake).
- Collapsing `test.each` suites that start one server per row (`insights-routes` invalid queries, `history-routes` invalid limits).
- Any change to production code other than the `data-faded` attribute on streamgraph band paths.
- The audit's count-neutral reshapes: `test.each` tables for the two timeline-panel "pending topics … being named" tests, the three "Summarize is disabled" cases and the entrypoint's missing/empty and missing/invalid pairs. They change no count and no coverage.

## Design

### What goes, and where its assertion lives now

**libs/types** (13 → 7)
- DROP timeline "the retry header and the shortest retry keep their values": two constants compared with their own literal values.
- DROP documents "ranks owner above editor above reader and maps links to roles": restates a table; `documents-repository` "grant upgrades a role and never downgrades it" and `share-links-routes` "a reader who accepts the edit link becomes an editor" pin the behaviour.
- MERGE five path-builder tests (documents "builds encoded document api paths"; timeline "builds version and topics paths with encoded ids", "builds the iframe page of a version", "puts each version on its own collaboration endpoint", "builds the selection summary path under summaries") into one new `routes.test.ts` "builds every path with its ids encoded". That new test also absorbs the server's `sharePagePath` test (below).
- REWRITE timeline "the selection query parameters are the page search parameters" into a type-level check that every page search parameter value is a timeline query parameter value.

**libs/history** (80 → 72)
- DROP the 5 `edit-windows` tests and the 2 `single-flight` tests with both modules and their `index.ts` exports (owner decision).
- DROP words "counts a run built from keystrokes": `[...'Hello w'].join('')` is the literal `'Hello w'`, already the shape of the first test.

**apps/server** (383 → 336 passed)
- DROP 6 `repository-shape/ci-workflow.test.ts` YAML greps and 14 `repository-shape/delivery-docs.test.ts` prose pins (owner decision). Kept there: the two relative-link checks, the broken-anchor detector, the runbook-sets-every-compose-variable check, "the docker job needs no other job and no secret" and "the workflow grants the token read access to the contents only" (least privilege). `compose`, `dockerfile` and `entrypoint` tests are untouched.
- DROP llm-client "the unavailable reasons name the language model, not one feature" and prompts "the system prompt tells the model to list each person separately": literal-in-literal checks; the behaviour is pinned by "a name containing a comma survives the model splitting it" and "a name the model split at its comma is matched back to the sent name".
- DROP connection "creates the auth tables after migrating" and migrate "creates the update log tables for the history set": every server test migrates both sets and fails without the tables.
- MERGE share-links-routes "the share page path is built from the token" into the libs/types routes table.
- MERGE share-links "one nonce and secret derive the same token twice" + "two nonces derive different tokens" into one test; "another secret derives a different token" is covered by share-links-routes "links stored under another secret are regenerated and work".
- MERGE session "returns null without a cookie" into app "me without a session returns a null user" (`/me` reads the session through `readSession`).
- MERGE app "health answers ok" into server "still answers the health endpoint with the web directory mounted".
- MERGE room-name "refuses an uppercase uuid and a trailing newline" into the first room-name test.
- MERGE timeline-routes "term filters runs case-insensitively" (lib runs "matching is case-insensitive and finds backspaced deletions"; the route keeps `term` through "term=a.b*( narrows without a 500"), "two hours of history choose two-minute bins" (lib bins `chooseBinMs` table; the route keeps an explicit `binMs` through "a fixed binMs outside the ladder is 400"), "bins carry the version of their end" (lib bins "bins between edits stay empty and carry the version before their end" and "a bin ending on a minute boundary resolves to the mark of its own minute"), and "deleting the runtime document forgets its cached pipeline" (folded into documents-routes "delete removes the row, the file, the log and the events, and closes the room", which then also asserts the pipeline is forgotten through the real delete path).
- MERGE history-routes "events page on a sequence boundary" into lib read-model "readPage ends on a sequence boundary"; the route's valid-`limit` and `afterSequence` parsing moves into "events default to a 500-event page", which gains a `limit=1` request.
- MERGE insights-routes "a second editor on the same document inside the cooldown is 429 with Retry-After" into the same-user cooldown test; "a refresh while a run is in flight returns 202 without a second model call" into "the same user refreshing again while the run is in flight gets 202, then 429 once it ends" (which gains the one-model-call assertion); "deleting a document forgets its selection cooldown" into "deleting a document forgets its refresh and summary cooldowns".
- MERGE six selection-summaries-service tests into their insights-routes twins: "reading never calls the model" (twin: "polling the GET never calls the model"), "an empty selection is none and cannot be requested" (twin: "a selection with no edits is none and its POST costs nothing"), "an unavailable model reads as failed with the reason and refuses requests" (twin: "without a model the GET is failed with the reason and the POST is 503"), "a full worker answers busy without a row" (twin: "a full worker answers 503 busy", which gains the no-row read), "an exhausted hourly cap answers busy with the time until a slot frees" (twin: the route's 503 test plus insights-worker "the wait for a call slot runs until the oldest call leaves the window and is never below the minimum"), "forget drops the document cooldown" (twin: the delete-forgets-cooldowns route test).
- MERGE topics-service "refresh without an LLM fails without calling anything" into "no LLM fails with the configuration reason"; "a twelve-topic answer is saved as eight topics and the prompt carries no email" (lib topic-assignment "twelve topics keep the eight largest in the order the model gave" and topics-service "prompts escape markup and carry no email"); "a recompute keeps the id of a topic that keeps its blocks" (lib topic-assignment "a recomputed topic keeps the id of the topic it mostly covers" and insights-repository "a recompute keeps reused topic ids with their summaries and drops the rest").
- REWRITE collaboration-server "storing is forced after a bounded delay under continuous typing": from "configuration equals its own constant" to "while a client types faster than the store debounce, the document is stored (touched) within `MAX_STORE_DEBOUNCE_MS` plus one debounce".
- REWRITE attach-collaboration "a socket that never authenticates is closed by the server": from a real 10 s wait to a 300 ms idle timeout set on the test server's Hocuspocus configuration, asserting the close code is 4401 (Unauthorized) within 3 s.
- REWRITE versions-routes "every version served equals a full replay at its mark": eight minutes of marks become three; same assertions.
- REWRITE version-rooms "stop clears its timeout when destroying a room fails": from pairing `setTimeout`/`clearTimeout` spy calls to the outcome "after the rejected stop no timer is left" (`vi.getTimerCount()` is 0 under fake timers).

**apps/web** (218 → 205)
- DROP highlight-edits "the comment and match APIs keep the shape the highlighter relies on": a runtime no-op `expectTypeOf`; `highlight-edits.ts` calls those APIs, so `pnpm typecheck` already fails on a shape change.
- DROP the three timeline-api "a %s selection summary is returned as the server sent it" rows: they pass for any body; "reading a selection summary sends every part of the selection" already checks the round trip.
- DROP versions/time-travel "below the wide layout the editor keeps a usable height and the panel stacks under it": asserts Tailwind class strings; the E2E "narrow viewport stacks the panel" measures the real layout.
- MERGE streamgraph "the tooltip aligns to the edge it is near" (its centre case moves into "the tooltip follows the pointer and aligns inward at the edges") and "the first and the last bins open their tooltip inward" (the every-pixel `test.each` pins the alignment function; the pointer test pins the attribute wiring).
- MERGE timeline-api "fetchTimeline without filters requests the bare path" into "fetchTimeline sends only the present filters"; "a selection at a period sends the bin size of that period", "a selection without a period never sends a bin size" and "an empty selection is read from the bare path" into one URL table that replaces "reading a selection summary sends every part of the selection".
- MERGE timeline-panel "the button is disabled while the request is in flight and while the summary is up to date": its in-flight half moves into "an editor summarizes the filtered selection and sees who edited"; its up-to-date half duplicates "an up-to-date summary disables Summarize and a stale one shows the badge and enables it".
- MERGE versions/time-travel "Escape in the title input keeps the version" as the first, negative step of "Escape leaves the version from anywhere but a field being typed in".
- REWRITE streamgraph "every band is a focusable path labelled with its size" (no class asserts; both a topic band and Other are focusable labelled paths) and "a highlighted band keeps full opacity while the others fade" (`data-faded` instead of `opacity-40`).
- REWRITE versions/time-travel "the previous frame stays until the next one is ready and foreign messages are ignored": the `invisible` class assert goes; `aria-hidden` carries it.

**E2E** (48 → 38)
- REWRITE selection-summary "a new edit marks the summary as for an earlier state and Summarize refreshes it after the cooldown": it absorbs "an edit outside the filter also marks the summary as for an earlier state" and stops at the stale badge plus an enabled Summarize button, with exactly one model call. The refresh after the cooldown is pinned by selection-summaries-service "a new edit marks the summary stale and a request recomputes it after the cooldown" and timeline-panel "an up-to-date summary disables Summarize and a stale one shows the badge and enables it".
- DROP selection-summary "an empty selection disables Summarize with a reason" (timeline-panel "Summarize is disabled with a reason when nothing matches").
- MERGE selection-summary "a second filter inside the cooldown shows when to retry" (insights-routes "…another filter inside the cooldown is 429" and timeline-panel "a request too soon shows the seconds from Retry-After"); "a reader sees the summary but no Summarize button" (its role check moves into time-travel "a reader opens the timeline and a version, cannot refresh, and the room drops their edits"; reading is pinned by timeline-panel "a reader reads the summary but has no Summarize button" and insights-routes "…a reader reads it"); "the summary fits a 375 px screen" (into timeline "narrow viewport stacks the panel").
- MERGE time-travel "Browser Back from a version returns to live" into "the edit bin shows the edit and lists it" (the first-bin walk already exits through Back to live); "a non-member opening an at link sees the document is unavailable" (versions-routes "versions routes and version endpoints refuse a non-member like a missing document", web "an inaccessible document never requests a version", documents E2E "delete removes the document for everyone").
- MERGE timeline "topics unavailable shows author bands" into time-travel "a reader sees failed topics without a Retry button while the owner has one" (which gains the author-band check); "two quick arrow presses land on the second bin with one navigation" into "keyboard moves the selected bin"; "filter by username hides the other author" into "filter by term survives a reload".

### Data flow

Unchanged. No runtime path changes; `data-faded` mirrors the existing `isFaded` flag that already drives the `opacity-40` class.

### Interfaces

- `apps/web/src/features/timeline/streamgraph.tsx`: band `<path>` gains `data-faded={isFaded}`.
- `libs/history/src/index.ts`: stops exporting `edit-windows` (`groupIntoWindows`, `EditWindow`, `WindowRules`) and `single-flight` (`SingleFlight`). No importer exists outside the deleted files (verified with `rg`).
- New file `libs/types/src/routes.test.ts`.

### Failure handling

A merge that loses its assertion is the failure this lane can cause. The test plan pins each fold with a mutation check (break the behaviour, watch the surviving test go red, restore). Each task ends with its suite green and the exact count; a count off by any number stops the task.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Drop the 20 repository-prose tests in `delivery-docs` and `ci-workflow`? | keep · drop all 26 · drop the 20 prose/YAML pins | Drop the 20; keep the Dockerfile, entrypoint, compose, link-check and least-privilege tests | 2026-10-17 |
| Delete `edit-windows` and `single-flight` with their tests? | keep · delete | Delete; add a one-line addendum to ADR 0001 where it mentions windows | 2026-10-17 |
| Drop or shorten the projection-scheduler "rebuilt at startup" test (22 s)? | drop · rewrite · keep | Keep as is: it pins a migration path | 2026-10-17 |
| Redo the failed-summary E2E stabilization? | redo · skip | Skip: done in PR #7 | 2026-10-17 |
| Lane order | before B · after B | After lane B; paths are written as they are after B | 2026-10-17 |
| Where does the server `sharePagePath` test go? (planner, autonomy: test names) | drop · fold into the libs/types routes table | Fold into the routes table; `sharePagePath` lives in `libs/types/src/routes.ts` | 2026-10-17 |
| Where does "deleting the runtime document forgets its cached pipeline" go? (planner) | the pure cache test · the documents delete route test | The delete route test: it proves the real delete path forgets the pipeline and keeps the cache test free of a server | 2026-10-17 |
| Which walk absorbs Browser Back? (planner) | first-bin walk · edit-bin walk | The edit-bin walk: the first-bin walk already exits through Back to live | 2026-10-17 |
| How does the idle-socket test get a short timeout? (planner) | new `startServer` option · set `services.hocuspocus.configuration.timeout` in the test | Set it in the test: no product seam while lane C1 is about to split `startServer` | 2026-10-17 |

## Test strategy summary

This lane changes tests, so the proof is that the surviving suite still fails when the removed tests would have. Per task: exact before and after counts, then a mutation check for every fold and rewrite (break the code the removed test guarded, watch the named surviving test fail for that reason, restore). `pnpm typecheck` covers the type-level rewrite and the dropped type test. The full `/verify` and a CI run compare durations. No Playwright MCP walk: nothing a user sees changes.
