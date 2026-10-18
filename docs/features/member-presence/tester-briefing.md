# Tester briefing: Member presence

Written by developer-ca. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `members.tsx` invalidates the members query, debounced and without cancelling a fetch, when the set of peers with a rendered caret changes, names every member button with `memberLabel` and describes it by the jump text or the reason; `editor-header.tsx` passes `documentId`.
- `timeline-notices.tsx` shows the empty copy only when there are no bins and the projection is not behind.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit src/features/editor/members.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `members.test.tsx::a peer caret leaving refreshes the members query`, c637a309 | `expected "invalidateQueries" to be called with arguments: [ { queryKey: [ 'documents', …(2) ] } ]`, number of calls 0 | 24f8cbfa |
| `members.test.tsx::a burst of presence changes during a members fetch invalidates once without cancelling it`, 55b15f7c | `expected "invalidateQueries" to be called 1 times, but got 10 times` | the commit after 55b15f7c |
| `members.test.tsx::a member with a live position is named Bruno, online and described by Go to Bruno’s cursor`, 1a3a3be5 | `Unable to find role="button" and name "Bruno, online"` | 75598460 |
| `timeline-notices.test.tsx::the empty copy stays hidden while the projection is behind the log`, 5c0039b3 | `expected document not to contain element, found <p` | 278f4285 |

## Hypotheses to attack

1. A peer that leaves shows offline within moments, not after the 5 s poll.
2. The same member state always has the same name, with or without a rendered caret.
3. The empty Edits copy never flashes right after typing.

## Known gaps

- The sign-out socket close itself is not changed; it already happens on unmount.
