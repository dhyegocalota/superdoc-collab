# Test plan: Device first

## The failing test first

- [ ] `apps/server/src/documents/documents-routes.test.ts::a heavy document the server can hold is prepared on the device when the device is asked for` — input: heavy upload with `preparation=device` at 8 GB; expected: owner answered Create, preparation not run by the server.

## Unit

- [ ] `apps/web/src/features/documents/use-upload-document.test.tsx` — guard passed sends Device; guard failed sends Server; 413 with `canPrepareOnDevice: false` shows the refusal and no button.
- [ ] `apps/server/src/documents/documents-routes.test.ts` — light upload with the flag is prepared by the server; heap-refused heavy upload with the flag is 413.
- [ ] `apps/server/src/collaboration/room-bootstrap.test.ts` — `requestOnDevice` registers a Preparing device job with the device estimate.
- [ ] `apps/web/src/features/editor/document-page.test.tsx` — the device panel stays after the editor exists and until ready and painted; the server-path panel stays over the preview until the swap ends.

## E2E (Playwright specs)

- [ ] `e2e/device-first.spec.ts` — heavy upload goes device-first, the panel stays until the editor is ready, typing works, a joiner reads "Being prepared on Ana's device" then gets the text.

## Edge cases found during execution

Empty on purpose.

## Coverage honesty

- A restart mid-preparation falls back to the server on the next open; not tested here.
