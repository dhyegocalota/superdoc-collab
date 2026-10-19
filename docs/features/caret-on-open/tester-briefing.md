# Tester briefing: Caret on open

## What changed
- `use-caret-on-open.ts` presses a synthetic pointer sequence at the first fragment of the page, once collaboration is ready, for editor roles only. The spike table in `spec.md` shows why `focus()` and `reveal` do not work.
- `superdoc-editor.tsx` tracks collaboration readiness in state and calls the hook. The hook never runs for a reader and does not rerun on reconnect, only when the editor instance is rebuilt.
- The hook skips the press when focus already sits outside the editor, for example in the title input.
- `CARET_ON_OPEN_TIMEOUT_MS` in `libs/types/src/constants.ts` bounds the animation-frame wait for the first fragment.

## Red today, green after
| Test | Red commit | Result |
|------|------------|--------|
| `e2e/caret-on-open.spec.ts` a new document accepts typing without a click | 6e1485b0 | red: no local caret appears |
| `e2e/caret-on-open.spec.ts` a joiner types without a click | 6e1485b0 | red: no local caret appears |
| `e2e/caret-on-open.spec.ts` a reader has no caret | 6e1485b0 | pin, green on arrival |
| `use-caret-on-open.test.ts` (7 tests) | 6e1485b0 | red: `useCaretOnOpen is not implemented` |

## Hypotheses to attack
- The first keystroke never raises the rejected-edit status: repeat the new-document test many times.
- Renaming the title right after opening keeps focus in the title input.
- A socket cut and reconnect does not move the caret.
- A past-version view and the print frame show no caret.
- Mobile Safari focus rules are not exercised.
