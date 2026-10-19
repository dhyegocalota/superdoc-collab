# Tester briefing: Equal card heights

**Changed:** `document-card.tsx` only: the article is `h-full`, the title reserves two lines with `min-h-[2lh]`, the meta line is `truncate`.

**Red today, green after:** `document-card.test.tsx` "the card fills its grid cell and reserves two title lines…" (red at 5b7f6b5c: `Expected the element to have class: h-full flex flex-col`); E2E "a long-title card and a short-title card are equally tall" at 1280 and 375 (without the change the difference is 24 px).

**Hypotheses to check in the walk:** a one-line title leaves a blank second line, never a shorter card; a long role and time line truncates instead of wrapping; the thumbnail keeps 4:5.

## Tester run 2026-10-19

Walk at 1280 and 375 with titles of 1 character, 14 characters and 140 characters, plus a card with a captured image.

- Confirmed: every card in a row is 426 px tall at 1280 and 486 px at 375; the meta line is a single 20 px line; a one-line title leaves a blank second line, not a shorter card; the long title clamps to two lines with an ellipsis; no sideways scroll.
- Not refuted: the thumbnail keeps the 4:5 box (310 by 387.5 at 375).
- Console at error level: 0.
