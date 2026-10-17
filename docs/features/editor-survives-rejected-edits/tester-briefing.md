# Tester briefing: The editor survives a rejected edit

## What changed

- `apps/web/src/features/editor/superdoc-exceptions.ts` — `SuperDocExceptionCode.EditRejected`, `isRecoverableException`.
- `apps/web/src/features/editor/superdoc-editor.tsx` — recoverable payload → `hasRejectedEdit` status line (`role="status"`, `EDIT_REJECTED_MESSAGE`), cleared on pointer down; others → fatal as before.
- `apps/web/src/features/editor/editor-copy.ts` — `EDIT_REJECTED_MESSAGE`.
- `e2e/collaboration.spec.ts` — the regression test.

## How to run

```bash
pnpm --filter @superdoc-collab/web test:unit -- src/features/editor
pnpm test:e2e e2e/collaboration.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `superdoc-exceptions.test.ts` (three cases) | stub threw `isRecoverableException is not implemented` | the classifier compares the code |
| `collaboration.spec.ts::an edit rejected under a concurrent delete does not stop the editor` | the fatal message rendered (lead's scratch run on main: 63 rejections) | only the status line renders |

Red commit: `7e6cc14`.

## Hypotheses to attack

1. Hypothesis: the SuperDoc instance keeps running after a rejected edit. Break it by: after the status line shows, have the other author type; the text must arrive.
2. Hypothesis: a click restores the caret. Break it by: click on the other author's text and type; the text must land once.
3. Hypothesis: every other code still shows the fatal message. Break it by: reading the classifier; only one enum member is recoverable.

## Known gaps

- A real fatal exception is hard to provoke on demand; the reader walk proves nothing regressed on the viewing path.
