# The jump to a member lands on the wrong person or on nobody

- Date: 2026-10-17
- Inspired by: `ba435f1` and `8bf66ad`, the review round that made a caret count for a member only by name and colour
- Revisited: 2026-10-17 — still true

## Signal
Clicking a member's avatar scrolls to a caret that belongs to someone else with the same name, or does nothing for a member who is plainly typing. Reading awareness for a cursor or a block id yields neither.

## Cause
The remote caret overlay (`.v2-collaboration-overlay__remote-caret`) carries no user id or client id in the DOM. It has the label text, a peer rank and the background colour. Awareness has only user fields, and `scrollToElement` returns false for every id. A label that SuperDoc truncates no longer equals the member's name, so it matches nobody.

## Do
Match a caret to a member by the pair of label text and normalised colour, claim a cursor only when exactly one caret matches, and treat a truncated label as no cursor. Give the glow to the selection that shares the caret's peer rank. Never match by name alone. Promoted to `.claude/rules/web-ui.md`.

## Anchor
`apps/web/src/features/editor/use-member-cursors.ts`, `use-member-cursors.test.ts` ("a peer whose name equals the member name but whose colour differs does not satisfy the jump", "two carets with the same name and colour are ambiguous"), commits `ba435f1`, `8bf66ad`
