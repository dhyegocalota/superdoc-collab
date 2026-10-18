# Tester briefing: Member presence

Written by developer-ca. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

Filled in when the build ends.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit src/features/editor/members.test.tsx
pnpm typecheck
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|

## Hypotheses to attack

1. A peer that leaves shows offline within moments, not after the 5 s poll.
2. The same member state always has the same name, with or without a rendered caret.
3. The empty Edits copy never flashes right after typing.

## Known gaps

- The sign-out socket close itself is not changed; it already happens on unmount.
