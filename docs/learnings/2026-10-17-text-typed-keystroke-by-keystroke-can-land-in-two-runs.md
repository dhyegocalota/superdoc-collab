# Text typed keystroke by keystroke can land in two runs

- Date: 2026-10-17
- Inspired by: two CI flakes fixed the same day: `84621f0` (PR #15, `selection-summary.spec.ts` "a failed summary explains itself and offers a retry": the fake model answered instead of failing) and `8248b80` (UX lane, `twoAuthorsInTwoTopics`: the Hiring band read zero after a reload); sibling of [keystroke-level events must be grouped into runs](2026-10-16-keystroke-events-need-runs-before-search.md)
- Revisited: 2026-10-17
- Revisited: 2026-10-17 — still true: `insertInParagraph` in `e2e/editor.ts` and the helpers in `e2e/timeline.ts` keep the same shape

## Signal
An E2E that types a marker or a filter term passes locally and fails on a loaded CI runner: the fake model never sees `FAIL-SUMMARY` whole, or a term filter finds neither half of "designer" and the band reads zero.

## Cause
`typeInParagraph` sends one keystroke at a time. On a slow runner the pause between two keystrokes can exceed the run grouping, or the keystrokes can straddle a ten-second bin, so the projection splits the word into two runs. Prompts and term filters read runs, so neither half matches.

## Do
Insert fixture and marker text as one input event (`insertInParagraph`, `page.keyboard.insertText`) whenever the test relies on the text being one run or matching a term. Keep `typeInParagraph` for tests about typing itself. Then wait for the text in the projected events (`insertedBy` over `readEvents`) and for `waitForSettledTimeline` before filtering or summarizing. Promoted to `.claude/rules/e2e.md`.

## Anchor
`e2e/editor.ts` (`insertInParagraph`), `e2e/timeline.ts` (`twoAuthorsInTwoTopics`, `waitForSettledTimeline`), `e2e/selection-summary.spec.ts`, commits `84621f0`, `8248b80`
