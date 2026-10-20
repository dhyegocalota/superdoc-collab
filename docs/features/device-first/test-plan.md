# Test plan: Device first

## The failing test first

- [x] `apps/server/src/documents/documents-routes.test.ts::a heavy document the server can hold is prepared on the device when the device is asked for` — input: heavy upload with `preparation=device` at 8 GB; expected: owner answered Create, preparation not run by the server. Evidence: red 6f756236, green c180f455.

## Unit

- [x] `apps/web/src/features/documents/use-upload-document.test.tsx` — guard passed sends Device; guard failed sends Server; 413 with `canPrepareOnDevice: false` shows the refusal and no button. Evidence: red 6bcd42a0, green 022679d9.
- [x] `apps/server/src/documents/documents-routes.test.ts` — light upload with the flag is prepared by the server; heap-refused heavy upload with the flag is 413. Evidence: 6f756236, c180f455.
- [x] `apps/server/src/collaboration/room-bootstrap.test.ts` — `requestOnDevice` registers a Preparing device job with the device estimate. Evidence: red 08e9a9d1, green c180f455.
- [x] `apps/web/src/features/editor/document-page.test.tsx` — the device panel stays after the editor exists and until ready and painted; the server-path panel stays over the preview until the swap ends. Evidence: red d58e17ab and 5c21c6b8, green 88c93e7e and aca73cf4.

- [x] `apps/web/src/features/open-progress/open-progress-panel.test.tsx` and `local-preview/local-preview.test.tsx` — the panel has no minimize control without a minimization or before the preview has pages; minimized it is a bar with the stage and the detail; the control maximizes it back. Evidence: red 7917ef9d, green 02048eaf.
- [x] `apps/web/src/features/local-preview/use-local-preview.test.tsx`, `local-preview.test.tsx` and `editor/document-page.test.tsx` — the creator of a device job with a kept file mounts the viewing-mode preview beside the Create editor, destroys its engine at the first painted paragraph, and drops the layer and the file when the editor is usable. Evidence: red 0a809e3b, green ee0157f6.
- [x] `apps/web/src/features/local-preview/device-guard.test.ts` and `document-page.test.tsx` — a device reporting less than 8 GB, or not exposing its memory, converts with no preview and drops the kept file. Evidence: red 7cda2569, green 171f936c.

## E2E (Playwright specs)

- [x] `e2e/device-first.spec.ts` — heavy upload goes device-first, the panel stays until the editor is ready, typing works, a joiner reads "Being prepared on Ana's device" then gets the text. Evidence: 8ab08d32; measured upload to editable 70 s and joiner text 77 s (479d5e15), 68 s and 74 s, then 79 s and 87 s (scratchpad run logs of 2026-10-20).

- [x] `e2e/device-first.spec.ts` — the preview's pages appear before the editor is editable (first text at 9.6 s, editable at 68 s), no sample after the preview's first text shows no text, the panel minimizes to the bar (stage and "elapsed") and maximizes back, the swap keeps text on screen. Evidence: fc9a847e, run of 2026-10-20 (2 passed).
- [x] `e2e/device-first.spec.ts` second case — the Create editor alone, with no kept file, converts the heavy upload and the panel leaves (56.8 s to 67.2 s in three runs). Evidence: fc9a847e.
- [x] Memory figures — preview plus Create overlap 3573 to 4757 MB resident, Create alone 3527 to 4080 MB; the overlap passes 4 GB, so the preview is mounted only at 8 GB reported. Evidence: spec Measured section, 171f936c.
- [x] `e2e/local-preview.spec.ts` and `e2e/room-admission.spec.ts` with `e2e/device-first.spec.ts`, serial, `--workers=1`: 17 passed in 8.9 minutes. Evidence: run of 2026-10-20 at fc9a847e.

## Edge cases found during execution

- [x] Typed text after the editor became usable took 5.0 s and 6.3 s to appear while the layout was finishing; the E2E waits up to the editor-ready timeout and records the delay. Evidence: fc9a847e plus the longer wait in 7cda2569.

## Coverage honesty

- A restart mid-preparation falls back to the server on the next open; not tested here.
