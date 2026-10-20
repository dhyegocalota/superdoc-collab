# Device first: a capable device prepares every heavy upload, and the panel stays until the editor is usable

**Status:** Building
**Tier:** 🔴
**Owner approval:** approved 2026-10-20 (requirement 38). Measured in production on an 8 GB server: the uploader of the 9.5 MB document saw a read-only preview at about 10 s and could edit only after about 3 min, because the server converted the file again (1.5 to 2 min) and the browser then downloaded, applied and laid out 36 MB of state. Before PR #81 the uploader's browser was the source of the room and the document was editable at about 1 min.
**ADRs:** [0049](../../adr/0049-the-uploader-previews-locally-and-a-refused-file-is-prepared-on-the-device.md), [0048](../../adr/0048-the-server-bootstraps-the-room-after-the-upload.md)
**Not changing:** the update log, the projection, share links, the memory guard formula, the heap budget, the per-user cap of heavy rooms, the hourly heavy budget, the light path, the upload size cap, SuperDoc.

## Problem

The device path of [local-preview](../local-preview/spec.md) already does what the owner wants: the owner's tab converts, seeds the room under the bootstrap fence, and joiners wait on "Being prepared on <name>'s device". It is offered only when the memory guard refuses the file, so on a server that can hold the file the uploader waits for a second conversion on a slower CPU.

## Goals

| Goal | Rule |
|------|------|
| Device by default | Every upload from a device that passes the device guard (wide layout and `navigator.deviceMemory`, when exposed, at or above the existing threshold) is sent with `preparation=device`. A device that fails the guard sends the server path, as before. |
| The server decides by weight | The server honours the flag for a heavy file (the heavy lane of `bootstrapLaneOf`) or a file its memory guard refuses; a light file is prepared by the server whatever the flag says, because it is fast there. The honoured flag keeps the heap-budget refusal (413, `canPrepareOnDevice: false`), the heavy room admission, the per-user cap of heavy rooms and the hourly heavy budget. |
| Preview while the device converts | On the device path the open answer is `RoomMode.Create` at once and the Create editor converts; the server converts nothing. The uploader's kept file also mounts the viewing-mode preview of [local-preview](../local-preview/spec.md) as an overlay, so pages show within seconds. When the Create editor paints its first paragraph the preview engine is destroyed and its painted pages stay frozen, as on the server path, until the editor is usable. A tab with no kept file (a reload) shows the panel over the editor's skeleton. A failed or expired device job is prepared by the server on the next open of a file it can hold. |
| The panel stays | On the device path the open-progress panel ("Preparing on this device · about N s · M s elapsed", the stages and the bar) stays, over the preview's pages or the editor's skeleton, until the collaborative editor reports ready and the first paragraph is painted. The estimate is the file's text size at `DEVICE_MS_PER_MEGABYTE`. |
| Minimizable | When the preview's pages appear, on both paths, the panel gets a minimize control that turns it into a thin top bar carrying the stage and "about N s · M s elapsed"; the bar has a control that maximizes it back. Default maximized; the state lives in the page only and is not stored. The copy lives in the open-progress copy file. |
| Weak devices | On the server path the preview stays, and the same panel (a translucent card) sits over the preview pages until the live editor has painted; the thin status line is gone. A preview that cannot open keeps one failure line. |

## Non-goals

- Making the conversion faster.
- A device source for a person who is not the owner.
- Surviving a server restart mid-preparation on the device: the registry is in memory, so the next open of a file the server can hold is prepared by the server.

## Design

### Data flow

```
upload (guard passed)  POST preparation=device
  heavy file  -> stored, device job registered, owner opens as Create, panel until ready + painted
  light file  -> stored, server converts (flag ignored), preview path as before
upload (guard failed)  POST preparation=server -> as before
```

### Interfaces

- `libs/types`: `DEVICE_MS_PER_MEGABYTE`.
- Server: `RoomBootstrap.requestOnDevice`, `DocumentRuntime.bootstrapRoomOnDevice`, `storeDocument` takes the preparation source; the device job's `estimatedMs` uses the device rate.
- Web: `preparationOf` in the upload hook; `preparingHereView` takes the bootstrap estimate; `DocumentPage` ends the device panel on ready and painted; `LocalPreview` takes the view of the panel and keeps it until the swap ends; `useLocalPreview` takes `isPreparingHere` so the kept file is shown on the device path; `OpenProgressPanel` takes a translucent variant and an optional minimization.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| Guard passed but the heap cannot hold the room | 413 naming the largest size, no device button; nothing stored |
| The device tab closes mid-preparation | As [local-preview](../local-preview/spec.md): joiners read the stopped message, the owner's next open registers a fresh device job |
| Flag on a light file | Ignored |

## Measured (2026-10-20)

Laptop, local stack, headless Chromium, other lanes loading the machine, one run each, `e2e/device-first.spec.ts` with the heavy fixture (9.5 MB, 56,800 paragraphs). Times start when the file is chosen in the upload dialog.

| What | Server path (PR #81, production, 8 GB) | Device first (local) |
|------|----------------------------------------|----------------------|
| Uploader: upload to editable (panel gone, first paragraph painted, collaborative editor ready) | about 180 s | 70 s (asserted under 120 s) |
| Joiner: from the same start to text in the editor | not measured | 77 s |
| Uploader: first text on screen with the read-only preview (weak device, server path) | 9.5 s | 9.5 s, unchanged |



## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Device by default, panel until editable | revert PR #81 / device first for capable devices | Device first when the guard passes; keep the server path for weak devices | 2026-10-20 |

## Test strategy summary

Unit: the preparation decision, the route (heavy honoured, light ignored, heap refusal kept, forged flag on a weak setup), the registry's `requestOnDevice`, the device estimate, the panel's lifetime on the page and in the preview. E2E in `e2e/device-first.spec.ts`: heavy upload goes device-first, the panel stays until the editor is ready, typing works, a joiner reads "Being prepared on Ana's device" then gets the text.
