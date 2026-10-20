# Tester briefing: Device first

Written by the developer. The developer did not run `test-plan.md` and does not declare the feature works.

## What changed

- `apps/server/src/documents/documents-routes.ts`, `store-document.ts` — the device flag is honoured for a heavy file or a file the memory guard refuses; the heap refusal now also applies to an honoured flag.
- `apps/server/src/collaboration/room-bootstrap.ts`, `collaboration-runtime.ts` — `requestOnDevice` registers a device job on request; the job estimates with `DEVICE_MS_PER_MEGABYTE`.
- `libs/types/src/constants.ts` — `DEVICE_MS_PER_MEGABYTE`.
- `apps/web/src/features/documents/use-upload-document.ts` — the first upload carries `preparation=device` when the device guard passes.
- `apps/web/src/features/editor/document-page.tsx`, `open-progress/` — the device panel shows the estimate and stays until the collaborative editor is ready and the first paragraph is painted.
- `apps/web/src/features/local-preview/local-preview.tsx` — the panel (translucent) stays over the preview pages until the swap ends; the status line is gone except for a failed preview.
- `apps/web/src/features/open-progress/` — the panel takes an optional minimization: a control turns the card into a thin top bar with the stage and the detail, a control on the bar maximizes it; `LocalPreview` offers it once the preview has pages; the state lives in the component.
- `apps/web/src/features/local-preview/use-local-preview.ts`, `device-guard.ts`, `editor/document-page.tsx` — the creator of a device job with a kept file and a device reporting 8 GB (`canPreviewOnDevice`) mounts the preview as an overlay while the Create editor converts; the engine is destroyed at the editor's first painted paragraph; the layer leaves when the editor is usable.
- `e2e/device-first.spec.ts` new; `e2e/local-preview.spec.ts` adapted (weak device for the large preview, no refusal for the device cases).

## How to run

```bash
pnpm exec playwright test e2e/device-first.spec.ts e2e/local-preview.spec.ts e2e/room-admission.spec.ts --workers=1
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `documents-routes.test.ts::a heavy document the server can hold is prepared on the device when the device is asked for` | the flag was ignored: the owner was answered Join and the server converted | the owner is answered Create, the joiner reads the owner's name, the scheduler is not called |
| `documents-routes.test.ts::a heavy document the heap cannot hold is refused even when the device is asked for ...` | 503 from the room admission instead of 413 with `canPrepareOnDevice: false` | the heap refusal runs for an honoured flag |
| `room-bootstrap.test.ts` device job estimates | `estimatedMs` used the server rate | the device rate |
| `use-upload-document.test.tsx::a device that passes the guard sends its first upload for the device` | preparation field was null | the field is `device` |
| `open-progress-view.test.ts::the creator of a device job reads ... with the estimate` | the estimate was ignored | "about 50 s" and a bar |
| `document-page.test.tsx` device panel tests | the panel left when the editor object existed | it stays until synced and painted |
| `open-progress-panel.test.tsx`, `local-preview.test.tsx` minimize tests | no minimize control | the bar and the control exist (7917ef9d red, 02048eaf) |
| `document-page.test.tsx`, `use-local-preview.test.tsx` device preview tests | no preview on the device path | the preview mounts beside the Create editor (0a809e3b red, ee0157f6) |
| `device-guard.test.ts::canPreviewOnDevice`, `document-page.test.tsx` less-memory case | the function threw not implemented and the preview mounted at any memory | 8 GB only (7cda2569 red, 171f936c) |
| `local-preview.test.tsx` panel tests | the status line showed and the panel left with the first paragraph | the translucent panel stays |

Pins: `document-page.test.tsx::the panel of the creator of a device job stays while the editor is synced but has painted nothing` was green when it landed.

## Hypotheses to attack

1. Hypothesis: a light file sent with the flag is prepared by the server. Break it by: uploading the 1.4 MB brief on a capable device and reading the open answer.
2. Hypothesis: a device failing the guard (narrow viewport, deviceMemory below 4) never sends the flag. Break it by: emulating deviceMemory 2 and reading the multipart body.
3. Hypothesis: the panel never disappears before the editor accepts typing. Break it by: throttling the CPU 4x while the heavy fixture opens.
4. Hypothesis: a joiner never sees a blank page. Break it by: opening the share link before and after the commit.
5. Hypothesis: on a device reporting 8 GB the preview shows pages within about 10 s while the panel counts, and the panel minimizes to a bar and maximizes back at any moment after the first page. Break it by: minimizing at the instant the swap happens, and by emulating 4 GB (no preview, panel only).
6. Hypothesis: a forged flag cannot fill the heavy rooms. Break it by: posting three heavy files with the flag as one user.

## Known gaps

- A server restart mid-preparation loses the in-memory device job; the next open of a file the server can hold is prepared by the server.
- An expired or failed device job whose claiming tab did not close is retried by the server on a file it can hold, because only the registry's holdability signal decides on a plain request.
- The memory of the tab with both engines reached 4.8 GB resident on the laptop; devices reporting less than 8 GB get no preview on the device path.
- The minimize state is not kept across the swap of a reload, by design.
- The measured numbers come from a laptop with other lanes running; production on Railway was not measured here.
