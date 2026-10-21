# Keystrokes land on BODY and typed text is silently missing, only under concurrency
- Date: 2026-10-15
- Inspired by: the proof of concept's results (findings 3 and 4) and its T2 concurrency test
- Revisited: 2026-10-16 — still true
- Revisited: 2026-10-21 — anchors moved off the proof of concept, removed on 2026-10-17, to the code that carries the fix today

## Signal
About one run in ten, during a reconnect storm or heavy concurrent typing, a client's text is shorter than expected. `document.activeElement` is `BODY` instead of the editor's `textarea`. Re-running the test alone passes.

## Cause
Clicking a text run does not always focus the hidden `textarea` while remote edits re-render the page. The keystrokes then go to `BODY` and never reach the document, so the history stays consistent but incomplete. A separate effect lets the caret land at the wrong offset about one run in fifteen, which makes marker order unreliable.

## Do
Type with focus verification: before each character, check the editor is focused; if not, click the paragraph again like a human would, press End, and record the recovery in `focusRecoveries`. Judge completion by the expected text length, never by marker order or marker presence.

## Anchor
- `e2e/editor.ts` — `focusParagraphEnd`, `typeInParagraph`
