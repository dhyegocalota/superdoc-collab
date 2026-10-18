# Test plan: Member presence

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `members.test.tsx::a peer caret appearing or leaving refreshes the members query` — input: a caret for Bruno is removed from the overlay; expected: `invalidateQueries` called with the members query key
- [ ] `members.test.tsx::a member with a live position is named Bruno, online and described by Go to Bruno’s cursor` — expected: the button name is `Bruno, online`
- [ ] `timeline-notices.test.tsx::the empty copy stays hidden while the log is ahead of the last timeline answer`, `timeline-panel.test.tsx::a document edited after the last timeline answer does not say it has no edits`, `superdoc-editor.test.tsx::reports every editor update to the page`, `use-last-edit-at.test.ts`
- [ ] `timeline-notices.test.tsx::no empty copy while the projection is behind` — input: no bins, `isBehind: true`; expected: no "No edits yet"

- [ ] `members.test.tsx::a burst of presence changes during a members fetch invalidates once without cancelling it` — input: five caret toggles during an in-flight members fetch; expected: one `invalidateQueries` with `{ cancelRefetch: false }`, one fetch

## Unit

- [ ] `timeline-notices.test.tsx::empty copy shows when there are no bins and the projection caught up` — expected: "No edits yet" shown
- [ ] the web unit files `members.test.tsx`, `use-member-cursors.test.ts`, `timeline-notices.test.tsx`, `timeline-panel.test.tsx`; expected: green

## Prove it for real — Playwright MCP

- [ ] Ana and Bruno open a document, Dani joins and signs out; expected: within a poll tick both headers show Dani without the online dot
- [ ] Reload Bruno's page; expected: in Ana's header Bruno is named "Bruno, online", the tooltip says "Go to Bruno’s cursor" once the caret paints
- [ ] Ana types in a new document with the Edits panel open; expected: "No edits yet" never shows once she has typed

- [ ] `e2e/final-visuals.spec.ts` member avatar jump case and two-colours case locate the button as "Bruno, online" / "Ana, online"; expected: green

## Edge cases found during execution

## Adversarial review

- [ ] Claim: the members query is not refetched when a peer only moves, renames or recolours its caret, and a burst of awareness frames starves neither the poll nor an in-flight fetch — attack: type as Bruno for 10 s and watch the requests

## Coverage honesty

- The poll window itself is timing-dependent; the unit test pins the invalidation, not the clock.
