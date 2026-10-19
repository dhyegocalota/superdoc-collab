# Exit confirmation while edits are unsynced

**Status:** Shipped 2026-10-19
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "don't let the user exit without saving changes; show an exit confirmation")
**ADRs:** [0032](../../adr/0032-connection-state.md) (connection state machine)
**Not changing:** the sync itself (edits sync on their own while online), the connection banner, the title rename API

## Problem

A collaborative document saves as it syncs, so "unsaved" means edits made while the socket was lost or reconnecting, or a title still being edited. Closing the tab or navigating away in those moments loses them silently.

## Design

- `useUnsyncedEdits` (`apps/web/src/features/editor/use-unsynced-edits.ts`): `true` from the first `onEditorUpdate` that happens while the connection reading is not Online/Clear (Lost, Reconnecting, Failed), or while the title editor has a changed, unsaved value; back to `false` when a transport report with `hasSynced: true` arrives (`recovered`/`synced`) or the title edit ends. `document-page.tsx` owns the state and passes a `reportTitleDirty` callback to `DocumentTitle` and reads the editor-update callback it already wires.
- Browser exit: while unsynced, a `beforeunload` listener calls `event.preventDefault()` and sets `event.returnValue` (browsers show their own confirmation; the text is not ours). Removed when synced or on unmount.
- In-app navigation: `useBlocker` from react-router (the router is `createBrowserRouter`) while unsynced; when a navigation is blocked, a Radix `AlertDialog` (`apps/web/src/components/ui/alert-dialog.tsx`, add it the shadcn way if absent) asks `EXIT_CONFIRMATION_TITLE` ("Leave without your latest edits?"), `EXIT_CONFIRMATION_DESCRIPTION` ("Edits made while the connection was down have not reached the server yet. Download the document first to keep them."), with `STAY_LABEL` ("Stay") as the cancel action and `LEAVE_LABEL` ("Leave") as the destructive action that calls `blocker.proceed()`. A second `Download` button in the dialog triggers the existing DOCX download. Copy in `editor-copy.ts`.
- Sign out from the account menu while unsynced did not reach the blocker in the E2E (the sign-in page appeared with no dialog). The likely cause, observed but not pinned by a failing unit test: the sign-out request completes, the session turns null and `RequireSession` replaces the document page, which unmounts the blocker. The page therefore publishes its unsynced state to `unsynced-edits-store.ts`; `SignOutMenuItem` reads it and, when unsynced, files a pending leave (the sign-out) that `ExitConfirmationDialog` confirms with the same Stay, Download and Leave choices. Leave runs the sign-out and the blocker lets that navigation pass.
- Reader role never blocks (no edits).

### Failure handling

| Case | Behaviour |
|------|-----------|
| Sync recovers while the dialog is open | the dialog closes itself and the navigation proceeds |
| The tab is closed | the browser's native prompt; nothing else is possible |
| `useBlocker` outside a data router (tests) | tests render inside `createMemoryRouter` |

## Test strategy summary

Unit: `use-unsynced-edits` state transitions (edit while Lost → unsynced; recovered → synced; title dirty → unsynced; title saved or cancelled → synced); the dialog renders on a blocked navigation and Stay keeps the route, Leave proceeds; `beforeunload` is registered only while unsynced. E2E (`e2e/connection-state.spec.ts` has the socket-cut helpers): cut the socket, type, click Documents → the dialog shows; Stay keeps the editor; reconnect → the dialog is gone and navigation works; also a changed title with the editor open and a click on Documents → the dialog.
