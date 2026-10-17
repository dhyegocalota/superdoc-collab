# Test plan: Known minors

Executed from the user's perspective. Every box states the input and the exact expected outcome; a ticked box carries ` — evidence: <commit | log | run>`. The Playwright MCP servers failed to connect in this session, so the user walk is covered by the three new E2E specs and the existing suites; boxes that needed the MCP walk are marked `BLOCKED` with that reason.

Setup: the stack from `docs/features/timeline-and-time-travel/test-plan.md` (built bundle, fake OpenRouter), two editors (`ana@`, `bruno@`).

## Escape leaves the editor

- [x] Click into the live editor, press Tab: the caret indents or moves inside the document and focus stays in the editor (unchanged). — evidence: walk spec: after Tab the active element stayed the editor textarea and the document text was unchanged
- [x] Press Escape: focus moves to the hidden "End of the editor" sentinel; press Tab: focus lands in the timeline panel (resize handle on wide layouts, the first button otherwise). — evidence: Escape put focus on the "End of the editor" paragraph; Tab then landed on the "Resize timeline panel" handle (1280 wide) and on the "Refresh topics" button at 375 wide; e2e spec time-travel.spec.ts:204 green; on f1c4af8 the sentinel is visible while focused (a 768x24 line at the bottom of the editor area)
- [x] Screen reader order: "Press Escape to leave the editor." is read before the document. — evidence: DOM order check: the sr-only hint precedes the editor container and the exit paragraph follows it
- [x] A reader (viewing mode) with the caret in the document presses Escape: focus leaves the same way. — evidence: tree 6c5fb24, Caio via read link: Escape focused "End of the editor" and Tab landed inside the timeline panel (1 of 1)

## Escape leaves the version

- [x] Open a version, click inside the frame, press Escape: the banner disappears and `?at=` leaves the URL. — evidence: walk spec: Escape after clicking the frame text emptied ?at= and removed the banner; e2e time-travel.spec.ts:188 green
- [x] Open a version, focus the empty filter box, press Escape: the version is left. — evidence: walk spec: Escape in the empty Filter box cleared ?at= (3 of 3 rounds)
- [x] Open a version, type "bud" in the filter box, press Escape: the draft is cleared, the version stays; press Escape again: the version is left. — evidence: tree 6c5fb24, keyboard.type("bud") then Escape: 8 of 8 rounds kept the version with an empty box, and the second Escape left it 8 of 8
- [x] Open a version, focus the title input, press Escape: the version stays (a field with text). — evidence: walk spec: title "Plan", Escape: ?at= and banner unchanged after 1 s
- [x] Escape with no version open does nothing visible. — evidence: walk spec: Escape on the live page left ?at= null, no banner, no navigation

## Naming topics notice

- [x] A document whose topics are being computed for the first time shows "Naming topics…" (unchanged). — evidence: topics-on-open.spec.ts exists and unit suite green; not re-driven in the walk (instant fake model)
- [ ] Refresh topics on a document with bands: "Naming topics…" appears while the recompute runs and disappears when it ends; the bands stay visible meanwhile. BLOCKED: the fake model answers instantly, so a real refresh (POST 202, then three timeline GETs all ready) never shows the notice. With the timeline response rewritten to pending by page.route, "Naming topics…" showed, the Budget band stayed in the SVG, and the notice cleared when the rewrite was removed (simulated, not a real recompute)

## Summary freshness across the whole document

- [x] Filter `@Ana`, Summarize; Bruno edits a paragraph Ana never touched: within one poll the card shows "For an earlier state" without any click. — evidence: e2e selection-summary.spec.ts:66 green (Ana's summary, an edit outside the filter, card shows "For an earlier state" with no click). Walk spec showed the same with Ana filter and Bruno typing in Hiring
- [x] Filter `@Ana`, Summarize; nobody edits for a minute: no re-read happens (network tab: no new selection GET). — evidence: walk spec counted selection-summary GETs for 60 s idle after Summarize: 0
- [ ] A topic recompute with no new edit still re-reads a topic-filtered summary (unchanged). BLOCKED: no E2E or walk drives a recompute without an edit on a topic-filtered summary; fake model is instant so the refresh could not be observed mid-flight

## Names with a comma

- [ ] A contributor named "Silva, Ana" edits; Summarize: the avatars include that person. BLOCKED: demo users have fixed names and the UI cannot create "Silva, Ana"; covered by apps/server/src/insights/selection-summaries-service.test.ts (server unit suite green)

## Automated

- [x] `pnpm typecheck` green. — evidence: server, web and e2e projects exit 0
- [x] `pnpm test:unit` green. — evidence: web 27 files 214 tests passed; server 40 files 383 passed, 2 skipped
- [ ] `pnpm test:e2e` green including the three new specs. BLOCKED: full suite not run by instruction; the three new specs ran green (3 passed in 28 s). Note the Escape-in-version spec on disk is now named "Escape clears a filled filter box first and leaves the version from inside the frame"
