# A banner whose copy passes its length pins still wraps to more lines than the design allows on a phone

- Date: 2026-10-17
- Inspired by: the connection-state review (the reviewer measured six lines at the pin limits) and the eight-width E2E, which failed with `failed at 320px: the text takes 7 lines, more than 5`
- Revisited: 2026-10-17 — still true; the E2E width test is the guard and the spec allows five lines for Failed on phones
- Revisited: 2026-10-18 — still true

## Signal
Every copy test is green, each string under its length pin, and the Failed banner takes six or seven lines at 320 or 375 px.

## Cause
Pins cap each string, not the sum of the title, the reason and the unsynced-edits sentence, nor how they wrap at a given width. Lines are a layout result.

## Do
Pin the combined reason and warning length, then measure the rendered text block at every width in a Playwright loop that reports each failing width, and set the allowed line count in the spec from the measurement.

## Anchor
`e2e/connection-state.spec.ts` (the banner and Reload fit at every width), `apps/web/src/features/editor/connection-copy.test.ts`, commits `db384b3`, `df5590a`, `cb42e19`, `b4ceda4`, `5e42dc7`
