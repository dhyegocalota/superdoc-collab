# Tester briefing: The loading line above the toolbar is for screen readers only

## What changed

- `apps/web/src/features/editor/document-page.tsx`: the status paragraph shown while `superdoc === null` now has the class `sr-only` instead of the visible text classes. Copy, role and wrapper are unchanged.
- No unit test pins the class (testing.md forbids pinning Tailwind classes); the red commit's test was removed in the review commit. The proof is the before and after screenshots.

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/document-page.test.tsx
```

## Red today, green after

The red commit `d324987` failed with `expect(element).toHaveClass("sr-only")`; that test was deleted in the review commit and replaced by screenshots.

## Hypotheses to attack

- While a document opens, sighted users see no text line above the toolbar, only SuperDoc's overlay.
- The accessibility tree still holds the status "Loading document…" and the Download button is described by it.
- The file-error message and the superseded case behave as before.
- Removing the visible line shifts no toolbar position.

## Known gaps

- Only the targeted file and the type check were run by the developer; no E2E and no browser walk. The visible absence is unproven by any automated test.
