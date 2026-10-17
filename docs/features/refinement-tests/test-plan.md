# Test plan: Refinement: tests

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

This lane removes and rewrites tests, so "the feature works" means: the counts land exactly, and every removed test's behaviour still turns a surviving test red when it breaks. Mutations are made in a scratch working tree state and reverted (`git checkout -- <file>`); none is committed.

## The failing test first

- [ ] `apps/web/src/features/timeline/streamgraph.test.tsx::a highlighted band keeps full opacity while the others fade` — input: the commit "test(web): assert band fading through data-faded instead of a class" checked out alone; expected: FAIL.
- [ ] Confirmed it fails for the right reason: the message is `Expected the element to have attribute: data-faded="false"` (attribute missing), not a render error; `git log --oneline` shows that commit before the commit that adds `data-faded`.

## Unit

### Counts land exactly (run on the branch head)

- [ ] `pnpm --filter @superdoc-history/types test:unit` — expected: `Tests  7 passed (7)` (was 13).
- [ ] `pnpm --filter @superdoc-history/history test:unit` — expected: `Tests  72 passed (72)` (was 80).
- [ ] `pnpm --filter @superdoc-history/server test:unit` with Docker Compose available — expected: `Tests  336 passed | 2 skipped (338)` (was 383 passed, 2 skipped).
- [ ] `pnpm --filter @superdoc-history/web test:unit` — expected: `Tests  201 passed (201)` (was 214).
- [ ] `pnpm typecheck` — expected: exit 0 (covers the type-level check in `libs/types/src/timeline.test.ts` and the e2e project).

### Rewrites are red for the right reason

- [ ] Type-level check — input: `TimelineSearchParam.Topic` changed to `'topics'`; expected: `pnpm --filter @superdoc-history/types typecheck` fails in `timeline.test.ts` at `toExtend`.
- [ ] Storing rewrite — input: `maxDebounce: MAX_STORE_DEBOUNCE_MS,` deleted from `collaboration-server.ts`; expected: "storing is forced after a bounded delay under continuous typing" fails on its `expect.poll` timeout.
- [ ] Idle-socket rewrite — input: the `configuration.timeout = SHORT_SOCKET_TIMEOUT_MS` line deleted; expected: "a socket that never authenticates is closed by the server as unauthorized" fails on the 3 000 ms deadline (close arrives after about 10 s).
- [ ] Version-rooms rewrite — input: `if (timer.handle) clearTimeout(timer.handle);` deleted from `VersionRooms.stop`; expected: "stop leaves no timer behind when destroying a room fails" fails with `expected 1 to be +0`.
- [ ] Replay rewrite — input: `readMainStoryText(replay(...))` in the assertion replaced by `''`; expected: "every version served equals a full replay at its mark" fails on the text comparison (proves the three-minute run still compares real text).
- [ ] Streamgraph focusable rewrite — input: `tabIndex` removed from the band path in `streamgraph.tsx`; expected: "every band is a focusable path labelled with its size" fails on `tabindex`.
- [ ] Previous-frame rewrite — input: `aria-hidden` removed from the pending frame in the version frame component; expected: "the previous frame stays until the next one is ready…" fails on `aria-hidden="true"`.

### Folds still guard (each mutation turns the named surviving test red)

- [ ] Path table — input: `sharePagePath` stops encoding (`return \`/share/${token}\``); expected: `libs/types/src/routes.test.ts::builds every path with its ids encoded` fails on `'/share/a%20b'`.
- [ ] Share tokens — input: `deriveShareToken` ignores `nonce`; expected: share-links "one nonce and secret derive the same token and another nonce a different one" fails. Input: it ignores `secret`; expected: share-links-routes "links stored under another secret are regenerated and work" fails.
- [ ] Session — input: `readSession` returns a fixed user when the cookie header is absent; expected: app "me without a session returns a null user" fails.
- [ ] Health — input: the health handler answers `{ status: 'down' }`; expected: server "still answers the health endpoint with the web directory mounted" fails.
- [ ] Room name — input: the room-name pattern gets the `i` flag; expected: the single room-name test fails on the uppercase case.
- [ ] Term matching — input: run matching made case-sensitive in `libs/history/src/timeline/runs.ts`; expected: runs "matching is case-insensitive and finds backspaced deletions" fails.
- [ ] Bin choice — input: the two-minute rung removed from the bin ladder; expected: bins "chooses the finest bin that fits for a span of %i ms" fails for 3 h.
- [ ] Bin versions — input: `buildBins` sets `versionSequence: null` for every bin; expected: bins "bins between edits stay empty and carry the version before their end" fails.
- [ ] Pipeline forget on delete — input: `timelinePipelines.forget(documentId)` removed from the runtime forget path; expected: documents-routes "delete removes the row, the file, the log and the events, and closes the room" fails on `forgetPipeline`.
- [ ] Event paging — input: `readPage` ends a page mid-sequence (drop the boundary query); expected: read-model "readPage ends on a sequence boundary" fails. Input: the events route ignores `limit`; expected: history-routes "events default to a 500-event page and honour a smaller limit after a sequence" fails on `[501]`.
- [ ] Refresh cooldown per document — input: the topics refresh cooldown keyed by user instead of document; expected: insights-routes "a second refresh on the same document inside the cooldown is 429 … for any editor" fails on the editor's status.
- [ ] Refresh in flight — input: a refresh in flight starts a second job; expected: insights-routes "a refresh while the run is in flight is 202 without a second model call, then 429 once it ends" fails on `toHaveLength(1)`.
- [ ] Selection cooldown forgotten — input: `selection.forget` removed from the delete path; expected: insights-routes "deleting a document forgets its refresh, summary and selection cooldowns" fails on the selection size.
- [ ] Selection reads never call the model — input: `SelectionSummariesService.read` calls `request`; expected: insights-routes "polling the GET never calls the model" fails.
- [ ] Empty selection — input: the empty check removed from `request`; expected: insights-routes "a selection with no edits is none and its POST costs nothing" fails.
- [ ] Unavailable model — input: `read` returns `None` when the model is unavailable; expected: insights-routes "without a model the GET is failed with the reason and the POST is 503" fails.
- [ ] Busy without a row — input: `request` saves a running row before `worker.run`; expected: insights-routes "a full worker answers 503 busy" fails on the new `None` read.
- [ ] Hourly wait — input: `retryAfterMs` returns the full window; expected: insights-worker "the wait for a call slot runs until the oldest call leaves the window…" fails.
- [ ] No LLM — input: the topics job calls `scheduler.blocks` before checking availability; expected: topics-service "no LLM fails with the configuration reason on read and on refresh without reading the blocks" fails on `blocks`.
- [ ] Eight topics — input: `MAX_TOPICS` raised to 12; expected: topic-assignment "twelve topics keep the eight largest in the order the model gave" fails.
- [ ] Topic id reuse — input: `saveTopics` always inserts new ids; expected: insights-repository "a recompute keeps reused topic ids with their summaries and drops the rest" fails.
- [ ] Tooltip centre — input: `tooltipAlignment` never returns `Center`; expected: streamgraph "the tooltip follows the pointer, aligns inward at the edges and centres in the middle" fails.
- [ ] Bare timeline path — input: `fetchTimeline` always appends `?`; expected: "fetchTimeline sends only the present filters" fails on the bare call.
- [ ] Selection bin size — input: `selectionParams` sets `binMs` without a period; expected: "a selection summary URL carries the present parts and a bin size only with a period" fails on the empty-selection row.
- [ ] Summarize in flight — input: the Summarize button stays enabled while its request is pending; expected: timeline-panel "an editor summarizes the filtered selection, waits on a disabled button and sees who edited" fails on `toBeDisabled`.
- [ ] Escape in the title — input: the Escape handler no longer skips text fields that hold text; expected: time-travel "Escape leaves the version from anywhere but a field being typed in" fails on its first step.

### Edge and error paths of the change itself

- [ ] Empty: `rg -n "edit-windows|single-flight|groupIntoWindows|SingleFlight|EditWindow|WindowRules" apps libs e2e` — expected: no output.
- [ ] Boundary: `rg -n "toHaveClass\('(opacity-40|invisible|topic-band|topic-band-other|shrink-0)'\)" apps/web/src` — expected: no output.
- [ ] Error path: the version-rooms file run alone and in full order — input: `pnpm --filter @superdoc-history/server exec vitest run src/collaboration/version-rooms.test.ts`; expected: all pass, and a deliberately failing `expect(leftTimers).toBe(1)` leaves the following tests in that file passing (fake timers do not leak).
- [ ] Error path: `pnpm --filter @superdoc-history/server exec vitest run src/collaboration/attach-collaboration.test.ts` — expected: every test passes; the timeout mutation affects only its own server.
- [ ] `docs/adr/0001-event-sourcing-over-yjs.md` ends with "## Addendum 2026-10-17" and one paragraph naming `edit-windows` and `single-flight`.

## E2E (Playwright specs)

- [ ] `pnpm exec playwright test --list | tail -1` — expected: `Total: 38 tests in 7 files` (was 48).
- [ ] `e2e/selection-summary.spec.ts::an edit outside the filter marks the summary as for an earlier state and enables Summarize` — steps: Ana filters by herself, summarizes, Bruno types in Hiring; expected: Ana's card shows "for an earlier state", Summarize is enabled, the fake model counted exactly one selection call; duration under 30 s (was 45 s).
- [ ] `e2e/time-travel.spec.ts::the edit bin shows the edit, lists it and Browser Back returns to live` — steps: open the edit bin, Browser Back; expected: no `at` in the URL, no version banner, the live text contains " More money".
- [ ] `e2e/time-travel.spec.ts::failed topics fall back to author bands and only the owner gets Retry` — expected: "topics unavailable" for both, an "Ana" band for the owner, Retry for the owner only.
- [ ] `e2e/time-travel.spec.ts::a reader opens the timeline and a version, cannot refresh, and the room drops their edits` — expected: also no Summarize button for the reader.
- [ ] `e2e/timeline.spec.ts::filters by person and term hide the other author and survive a reload` — expected: after `@bruno` the Budget band reads 0 characters and top edits list only Hiring; after `designer` and a reload both `author=bruno` and `term=designer` stay in the URL and the term chip shows.
- [ ] `e2e/timeline.spec.ts::keyboard moves the selected bin and two quick presses navigate once` — expected: End selects the last bin, two quick ArrowLeft presses land on the third-from-last bin, one `at=` navigation, at most one version request.
- [ ] `e2e/timeline.spec.ts::narrow viewport stacks the panel and fits the summary` — expected at 375 × 812: the panel starts below the editor, the summary card shows "edited", Summarize is visible, no horizontal scroll.
- [ ] Stability: `pnpm test:e2e e2e/selection-summary.spec.ts e2e/time-travel.spec.ts e2e/timeline.spec.ts --repeat-each=2` — expected: 38 passed, 0 failed; every merged walk under 60 s (durations recorded from the list reporter).
- [ ] Full gate: `/verify` (typecheck → unit → E2E) — expected: green end to end; log path recorded.
- [ ] CI: the PR run's `verify` job duration compared with the last `main` run — expected: at least 2 minutes shorter; both run ids recorded.

## Prove it for real — Playwright MCP

Not applicable: no user-visible change. `data-faded` renders nothing and the opacity class is unchanged. Each line below is answered for the record.

- [ ] Happy path, entry to exit: not applicable — no screen changes; the E2E walks above cover the flows.
- [ ] Empty: not applicable.
- [ ] Single: not applicable.
- [ ] Many: not applicable.
- [ ] Rejected input: not applicable.
- [ ] Browser Back mid-flow: covered by the merged E2E walk above.
- [ ] Reload mid-flow: covered by the merged filter walk above.
- [ ] Two authors in two browser contexts at once: covered by the merged summary walk above (Ana watches, Bruno types).
- [ ] Latency / disconnect: not applicable.
- [ ] Console and network clean: not applicable (no UI change).
- [ ] Desktop width: not applicable.
- [ ] Narrow width: covered by "narrow viewport stacks the panel and fits the summary".
- [ ] Screenshots / video: none (no UI change; `/check-ui` skipped with this reason).

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: dropping the twenty repository-prose tests loses nothing a later change could break unnoticed — attack: change a README section heading that the runbook links to, and delete a compose variable line from the runbook; result: the kept link check and the kept runbook-variables check fail (refuted if either stays green).
- [ ] Claim 2: the merged insights-routes tests cover every service behaviour that was deleted — attack: for each of the six deleted selection-summaries-service tests, break the service the way that test guarded and run `insights-routes.test.ts`; result: each mutation turns a route test red.
- [ ] Claim 3: the merged E2E walks are not slower or flakier than the walks they replace — attack: `--repeat-each=5` on the three changed specs and compare the summed duration with the ten removed walks' CI durations (about 160 s); result: no failure and a lower total.

## Coverage honesty

What is not tested and why.

- README sections, credits, license wording, the limits copy, the runbook's squash-merge and secret-scan notes, the `.env.example` secret markers and the CI docker-job shape are no longer pinned by tests — owner decision 2026-10-17; review catches prose drift, and the kept link and compose-variable checks catch broken references.
- The summary refresh after the real 30 s cooldown is no longer walked end to end — the server unit "a new edit marks the summary stale and a request recomputes it after the cooldown" and the panel unit "an up-to-date summary disables Summarize and a stale one shows the badge and enables it" pin both halves; the risk accepted is a wiring break between them that only a 45 s walk would show.
- A non-member opening an `at` link is no longer walked end to end — server, web unit and the delete walk pin the pieces.
- The read-triggered topics run plus an explicit refresh in flight is no longer a separate route test — the refresh-plus-refresh walk covers the same single-flight key.
- The audit's 11 `shouldAdvanceTime` web tests stay as they are; they are a stability risk this lane does not address.
