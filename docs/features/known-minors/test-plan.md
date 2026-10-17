# Test plan: Known minors

Executed from the user's perspective. Every box states the input and the exact expected outcome; a ticked box carries ` — evidence: <commit | log | run>`. The Playwright MCP servers failed to connect in this session, so the user walk is covered by the three new E2E specs and the existing suites; boxes that needed the MCP walk are marked `BLOCKED` with that reason.

Setup: the stack from `docs/features/timeline-and-time-travel/test-plan.md` (built bundle, fake OpenRouter), two editors (`ana@`, `bruno@`).

## Escape leaves the editor

- [ ] Click into the live editor, press Tab: the caret indents or moves inside the document and focus stays in the editor (unchanged).
- [ ] Press Escape: focus moves to the hidden "End of the editor" sentinel; press Tab: focus lands in the timeline panel (resize handle on wide layouts, the first button otherwise).
- [ ] Screen reader order: "Press Escape to leave the editor." is read before the document.
- [ ] A reader (viewing mode) with the caret in the document presses Escape: focus leaves the same way.

## Escape leaves the version

- [ ] Open a version, click inside the frame, press Escape: the banner disappears and `?at=` leaves the URL.
- [ ] Open a version, focus the empty filter box, press Escape: the version is left.
- [ ] Open a version, type "bud" in the filter box, press Escape: the draft is cleared, the version stays; press Escape again: the version is left.
- [ ] Open a version, focus the title input, press Escape: the version stays (a field with text).
- [ ] Escape with no version open does nothing visible.

## Naming topics notice

- [ ] A document whose topics are being computed for the first time shows "Naming topics…" (unchanged).
- [ ] Refresh topics on a document with bands: "Naming topics…" appears while the recompute runs and disappears when it ends; the bands stay visible meanwhile.

## Summary freshness across the whole document

- [ ] Filter `@Ana`, Summarize; Bruno edits a paragraph Ana never touched: within one poll the card shows "For an earlier state" without any click.
- [ ] Filter `@Ana`, Summarize; nobody edits for a minute: no re-read happens (network tab: no new selection GET).
- [ ] A topic recompute with no new edit still re-reads a topic-filtered summary (unchanged).

## Names with a comma

- [ ] A contributor named "Silva, Ana" edits; Summarize: the avatars include that person.

## Automated

- [ ] `pnpm typecheck` green.
- [ ] `pnpm test:unit` green.
- [ ] `pnpm test:e2e` green including the three new specs.
