# Tester briefing: Local preview

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- `libs/types/src/documents.ts` — `PreparationSource`, `PREPARATION_FIELD`, `DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES`, `UploadRefusal`, `OpenedDocument.preparedOnDeviceOf`, `INVALID_PREPARATION_MESSAGE`.
- `apps/server/src/collaboration/room-bootstrap.ts` — a device job for a file the server cannot hold: `request` registers it, `claimDevice` gives the owner an attempt, `deviceClosed` fails it, `isDevicePending` and `isDeviceCreator` read it.
- `apps/server/src/collaboration/collaboration-server.ts` — the member admission claims the device attempt, the disconnect hook reports a closed claimed socket.
- `apps/server/src/collaboration/collaboration-runtime.ts`, `apps/server/src/documents/documents-routes.ts`, `apps/server/src/server.ts` — the 413 body, the `preparation` field, the open answer (Create for the device creator, `preparedOnDeviceOf` for everyone), the guard wiring.
- `apps/web/src/features/local-preview/` — the kept-file store, `useLocalPreview`, `LocalPreview`, the device guard, the preview panel view and the copy.
- `apps/web/src/features/documents/` — the upload hook keeps the file and offers the device after a refusal; `UploadMessage` renders it in the dialog, the drop zone and the home.
- `apps/web/src/features/editor/` — `DocumentPage` mounts the preview while the answer is Queued or Preparing; `readinessOf` treats Create as Ready; `useCachedTitle`; `previewSuperdocOptions`.
- `apps/web/src/features/open-progress/` — a joiner's Preparing line names the owner's device.
- `e2e/local-preview.spec.ts`, `e2e/open-answers.ts`, `e2e/restartable-stack.ts` — the E2E spec, a scripted-answers helper shared with `e2e/open-progress.spec.ts`, and `startRestartableStack` taking named parameters and environment overrides.

## How to run

```bash
pnpm --filter @superdoc-collab/server exec vitest run src/collaboration/room-bootstrap.test.ts src/collaboration/collaboration-server.test.ts src/documents/documents-routes.test.ts src/collaboration/collaboration-runtime.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/local-preview src/features/documents src/features/editor src/features/open-progress
pnpm exec playwright test e2e/local-preview.spec.ts
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `room-bootstrap.test.ts::a document the server cannot hold is prepared on the device of its owner and never queued` (commit 8a0f7278) | `AssertionError: expected { stage: 'queued', … } to deeply equal { stage: 'preparing', … }` | `request` registers a device job when `isPreparableByServer` is false |
| `room-bootstrap.test.ts::the owner claims a device job…` and the other claim cases | `Error: claimDevice is not implemented` | `claimDevice` returns a fresh attempt for the owner of a pending device job |
| `documents-routes.test.ts::a refused document sent again for the device is stored, not converted…` | `AssertionError: expected 413 to be 201` | the `preparation=device` field skips the 413 and the registry registers the job |
| `documents-routes.test.ts::a preparation source outside the enum is 400…` | `expected [ 201, … ] to deeply equal [ 400, … ]` | `preparationSourceOf` rejects an unknown value |
| `collaboration-server.test.ts::collaboration device creator` (three cases) | `The collaboration server refused the connection.` | the member admission claims the attempt and the fence accepts it |
| `local-file-store.test.ts`, `device-guard.test.ts`, `use-local-preview.test.tsx`, `preview-open-view.test.ts` (commit d79250a9) | inert stubs return null; assertions such as `expected null to be File{}` | the modules are implemented |
| `local-preview.test.tsx`, `document-page.test.tsx` preview cases | `Error: SuperDoc was not constructed` and `Unable to find an element with the text: Preview · …` | `LocalPreview` builds a viewing-mode SuperDoc and `DocumentPage` mounts it while Waiting |
| `use-upload-document.test.tsx` device cases, `upload-message.test.tsx` | `expected null not to be null` and `Unable to find an accessible element with the role "button" and name "Prepare on this device"` | the hook exposes `devicePreparation` and `UploadMessage` renders it |
| `use-opened-document.test.tsx::a Create answer is ready at once…` | `expected 'waiting' to be 'ready'` | `readinessOf` treats Create as Ready |

Pins (green when they landed): a non-owner is refused on an uncommitted device room, a small file with the device flag is prepared by the server, no kept file waits without a preview, an upload sends no preparation field, nothing renders without a message. The E2E spec was written after the unit code; it has no red commit.

## Hypotheses to attack

1. Hypothesis: the preview never writes to the shared copy. Break it by: typing, pasting and dropping a file into the preview while the answer is Preparing.
2. Hypothesis: a stale tab of the owner cannot seed a device room twice. Break it by: opening the document in two tabs of the owner while the device converts the heavy file, then reloading the first.
3. Hypothesis: the heavy preview keeps the tab answering. Break it by: scrolling and clicking in the preview during layout, and watching the elapsed counter.
4. Hypothesis: a device job never survives the owner closing the tab. Break it by: closing the owner's tab mid-conversion, then opening as a joiner (expect the failure card) and as the owner (expect the editor and a new conversion).
5. Hypothesis: the forged `preparation=device` flag on a small file does nothing. Break it by: posting a small file with the flag from the console on a server with plenty of memory.

## Known gaps

- The device creator on the heavy fixture depends on the socket staying open for the 40 s the browser converts; see the commit that follows the first heavy run for what was needed.
- The E2E hybrid cases use `MEMORY_LIMIT_MEGABYTES` as a declared limit only; no container memory is enforced.
- `navigator.deviceMemory` is Chromium only; the memory half of the guard is not exercised by a browser test.
- The measured times are one run on one laptop.
