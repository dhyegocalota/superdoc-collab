# Tester briefing: Exit confirmation while edits are unsynced

## What changed

- `apps/web/src/features/editor/use-unsynced-edits.ts` — unsynced state, `beforeunload` listener.
- `apps/web/src/features/editor/exit-confirmation-dialog.tsx` — `useBlocker` plus the alert dialog.
- `apps/web/src/features/editor/document-page.tsx` — owns the state, stable edit and transport callbacks, renders the dialog.
- `apps/web/src/features/editor/document-title.tsx` — `onDirtyChange`.
- `apps/web/src/features/editor/editor-header.tsx` — two-line pass-through of `onTitleDirtyChange` (outside the lane's file list, approved by the lead), plus its test.
- `apps/web/src/components/ui/alert-dialog.tsx`, `editor-copy.ts` — primitive and copy.
- `apps/web/src/features/editor/unsynced-edits-store.ts`, `apps/web/src/features/auth/sign-out-menu-item.tsx` — sign-out asks first while unsynced.
- `e2e/exit-confirmation.spec.ts` — six scenarios.

## How to run

```bash
pnpm dev
```

Use the Docker-free stack from the install guide; stop and start only the server process to cut the socket.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `use-unsynced-edits.test.ts` (11) | `Error: useUnsyncedEdits is not implemented for lost` | the hook derives state from edits, reports and the title |
| `exit-confirmation-dialog.test.tsx` (6) | `Error: ExitConfirmationDialog is not implemented for false` | `useBlocker` shows the dialog and proceeds on sync |
| `document-title.test.tsx` dirty report (2 of 3) | `expected last "vi.fn()" call to have been called with [ false ]` | the title reports `isEditing` with a changed value |
| `document-page.test.tsx` (3 of 6 new) | `expected false to be true`, `Unable to find role="alertdialog"` | the page wires the hook and the dialog |

Pins (green on arrival): the reader, online-edit and synced-release page tests, and the reader title test.

## Hypotheses to attack

1. Hypothesis: only an edit made while Lost, Reconnecting or Failed arms the prompt. Break it by: typing right after the socket drops but before the banner shows.
2. Hypothesis: a `synced` report clears the prompt. Break it by: reconnecting while a title edit is open (the title must keep it armed).
3. Hypothesis: Leave never cancels the navigation. Break it by: clicking Leave, then Back.
4. Hypothesis: the editor is not re-created by the new callbacks. Break it by: watching for a reload flash on every banner change.

## Known gaps

- `onPaginationUpdate` shares the editor-update callback in `superdoc-editor.tsx` (outside the lane), so a layout change during an outage also arms the prompt.
- The browser's `beforeunload` text is not ours; E2E checks the event is cancelled, not the native dialog.
- Sign out while unsynced is covered by the store and the pending leave, not the blocker; the E2E uses a changed title because a signed-out request cannot complete while the server is down.
