# Tester briefing: <Feature title>

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## G2: exception outcomes and the version viewer

### What changed
- `apps/web/src/features/editor/superdoc-exceptions.ts` — `ExceptionOutcome`, `exceptionOutcome` and `failureReasonOf`; `isRecoverableException` is kept for G3 to remove.
- `apps/web/src/features/versions/version-viewer.tsx` — `onException` goes through `exceptionOutcome`; the local enum is now `ViewerConnectionState`.
- `.claude/rules/collaboration.md` — one bullet on exception narrowing.
- `libs/types/src/connection.ts` — only `ConnectionFailureReason`, mirrored from G1 so this lane typechecks; the lead keeps G1's file on merge.

### How to run
```bash
pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/superdoc-exceptions src/features/versions
pnpm typecheck
```

### Red today, green after
| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `superdoc-exceptions.test.ts::exceptionOutcome` and `failureReasonOf` rows | `Error: exceptionOutcome is not implemented` (stub) | the classifier is implemented |
| `version-viewer.test.tsx::a warn diagnostic calls neither onFailed nor onConnectionFailed` | `expected "vi.fn()" to be called +0 times, but got 1 times` | warn is Logged |
| `version-viewer.test.tsx::a collaboration reason calls onConnectionFailed and not onFailed` | `expected "vi.fn()" to be called 1 times, but got 0 times` | ConnectionFailed calls the connection handler |
| `version-viewer.test.tsx::edit-rejected calls neither` | `expected "vi.fn()" to be called +0 times, but got 1 times` | Recoverable does nothing |

`version-viewer.test.tsx::a fatal payload calls onFailed` is a pin: it was green before the change.

### Hypotheses to attack
1. Hypothesis: a warn diagnostic in a version view no longer ends time travel. Break it by: opening a version of a document that raises a warn diagnostic and checking the frame stays up.
2. Hypothesis: a collaboration refusal in a version view shows the connection-failed message, not the generic failure. Break it by: opening a version URL with the session cookie removed.
3. Hypothesis: any payload with neither a warn severity, `edit-rejected`, a collaboration reason nor the worker code is Fatal. Break it by: feeding `password-required` and an error diagnostic.

### Known gaps
- The raw string `'warn'` and the collaboration reason keys are matched as strings because the installed types are unions of literals; no run against a live SuperDoc was made.
- `worker-transport-failed` is not in the installed type definitions; it is read as a string.
- Test runs of the whole web suite were slow because of the shared heavy-command lock.
