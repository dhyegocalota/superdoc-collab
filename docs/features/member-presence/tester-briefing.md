# Tester briefing: Member presence

Written by developer-ca. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `members.tsx` invalidates the members query, debounced and without cancelling a fetch, when SuperDoc's `awareness-update` reports a peer added or removed, names every member button with `memberLabel` and describes it by the jump text or the reason; `editor-header.tsx` passes `documentId`.
- `timeline-notices.tsx` shows the empty copy only when there are no bins, the projection is not behind and the log is not ahead. `superdoc-editor.tsx` reports `onEditorUpdate`, `use-last-edit-at.ts` records it at most once per second, `document-page.tsx` passes it to `timeline-panel.tsx`, which compares it with the timeline query's update time.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit src/features/editor/members.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `members.test.tsx::a peer caret leaving refreshes the members query`, c637a309 | `expected "invalidateQueries" to be called with arguments: [ { queryKey: [ 'documents', …(2) ] } ]`, number of calls 0 | 24f8cbfa |
| `members.test.tsx::a peer with no rendered caret leaving refreshes the members query`, 029e19b8 | `expected "invalidateQueries" to be called once with arguments` (0 calls) | c71b56e8 |
| `members.test.tsx::a burst of presence changes during a members fetch invalidates once without cancelling it`, 55b15f7c | `expected "invalidateQueries" to be called 1 times, but got 10 times` | 273474bc |
| `timeline-notices.test.tsx::the empty copy stays hidden while the log is ahead of the last timeline answer`, 784fc116 | `expected document not to contain element, found <p` | 5627e319 |
| `timeline-panel.test.tsx::a document edited after the last timeline answer does not say it has no edits`, 39beea78 | `expected document not to contain element, found <p` | 573111fd |
| `superdoc-editor.test.tsx::reports every editor update to the page`, 05f908c2 | `TypeError: config.onEditorUpdate is not a function` | 220cdee0 |
| `use-last-edit-at.test.ts`, b5e78e00 | `useLastEditAt is not implemented` | 62af6087 |
| `members.test.tsx::a member with a live position is named Bruno, online and described by Go to Bruno’s cursor`, 1a3a3be5 | `Unable to find role="button" and name "Bruno, online"` | 75598460 |
| `timeline-notices.test.tsx::the empty copy stays hidden while the projection is behind the log`, 5c0039b3 | `expected document not to contain element, found <p` | 278f4285 |

## Hypotheses to attack

1. A peer that leaves shows offline within moments, not after the 5 s poll.
2. The same member state always has the same name, with or without a rendered caret.
3. The empty Edits copy never flashes right after typing.

## Known gaps

- The sign-out socket close itself is not changed; it already happens on unmount.
