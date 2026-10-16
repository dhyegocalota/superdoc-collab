# Keystrokes land on BODY and typed text is silently missing, only under concurrency
- Date: 2026-10-15
- Inspired by: poc/RESULTS.md (findings 3 and 4); poc/tests/t2-concurrency.spec.ts::T2
- Revisited: 2026-10-16 — still true

## Signal
About one run in ten, during a reconnect storm or heavy concurrent typing, a client's text is shorter than expected. `document.activeElement` is `BODY` instead of the editor's `textarea`. Re-running the test alone passes.

## Cause
Clicking a text run does not always focus the hidden `textarea` while remote edits re-render the page. The keystrokes then go to `BODY` and never reach the document, so the history stays consistent but incomplete. A separate effect lets the caret land at the wrong offset about one run in fifteen, which makes marker order unreliable.

## Do
Type with focus verification: before each character, check the editor is focused; if not, click the paragraph again like a human would, press End, and record the recovery in `focusRecoveries`. Judge completion by the expected text length, never by marker order or marker presence.

## Anchor
- `poc/tests/harness.ts` — `focusParagraphEnd`, `typeInParagraph`, `focusRecoveries`
- `poc/tests/harness.ts` — `reachesLength`, `countCaretAnomalies`
- `poc/tests/t4-chaos.spec.ts` — `T7: server restarts mid-session` logs `focus recoveries`
