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
| Preview while the device converts | On the device path the open answer is `RoomMode.Create` at once and the Create editor converts; the server converts nothing. The uploader's kept file also mounts the viewing-mode preview of [local-preview](../local-preview/spec.md) as an overlay, so pages show within seconds. When the Create editor paints its first paragraph the preview engine is destroyed and its painted pages stay frozen, as on the server path, until the editor is usable. The preview is mounted only when the device reports at least `DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES` (8 GB, the largest value `navigator.deviceMemory` reports); a device that reports less, or does not expose it, converts with the panel over the editor's skeleton and drops the kept file, because the overlap of two engines needs more memory (see Measured). A tab with no kept file (a reload) shows the panel over the editor's skeleton. A failed or expired device job is prepared by the server on the next open of a file it can hold. |
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

Laptop, local stack, headless Chromium, other lanes loading the machine, `e2e/device-first.spec.ts` with the heavy fixture (9.5 MB, 56,800 paragraphs). Times start when the file is chosen in the upload dialog. Two runs are shown where they differ by more than the noise.

| What | Server path (PR #81, production, 8 GB) | Device first (local) |
|------|----------------------------------------|----------------------|
| Uploader: upload to editable (panel gone, first paragraph painted, collaborative editor ready) | about 180 s | 68 s and 79 s (asserted under 120 s) |
| Uploader: first text on screen, from the preview of the kept file | not applicable | 9.6 s and 9.7 s |
| Uploader: first paragraph of the Create editor, which ends the preview engine | not applicable | 66 s and 76 s |
| Joiner: from the same start to text in the editor | not measured | 74 s and 87 s |
| Uploader: first text on screen with the read-only preview (weak device, server path) | 9.5 s | 9.5 s, unchanged |
| Typed text visible after the editor became usable | not measured | 5.0 s and 6.3 s, the main thread is still laying out |

The panel was on screen from its first appearance until the editor was usable, and at no sample after the preview's first text was there a moment with no text on screen.

### Memory of the uploader's tab

Peak of the sum of the renderer processes' resident memory and of the JavaScript heap, sampled every 500 ms by `e2e/tab-memory.ts`. Noisy by several hundred MB, so the range of the runs is shown.

| Window | Resident | Heap |
|--------|----------|------|
| Preview engine and Create editor both converting, until the Create editor's first paragraph | 3573 to 4757 MB (two runs) | 792 to 794 MB |
| From that paragraph (preview engine destroyed, frozen pages on screen) until the editor is usable | 4274 to 5153 MB (two runs) | 1182 to 1203 MB |
| The Create editor alone (document opened with no kept file; three runs) | 3527 to 4080 MB | 528 to 571 MB |

The overlap reaches 4.8 GB, above the 4 GB the device guard asks for, and the Create editor alone already needs 3.5 to 4.1 GB. The preview on the device path is therefore mounted only on a device that reports 8 GB (`canPreviewOnDevice`). A device that reports 4 to 7 GB, or that does not expose its memory, converts with the panel alone, as the first version of this feature did, and still passes the device guard to prepare the file.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Device by default, panel until editable | revert PR #81 / device first for capable devices | Device first when the guard passes; keep the server path for weak devices | 2026-10-20 |

## Test strategy summary

Unit: the preparation decision, the route (heavy honoured, light ignored, heap refusal kept, forged flag on a weak setup), the registry's `requestOnDevice`, the device estimate, the panel's lifetime on the page and in the preview. E2E in `e2e/device-first.spec.ts`: heavy upload goes device-first, the panel stays until the editor is ready, typing works, the preview of the kept file shows pages before the editor is usable, the panel minimizes to the bar and maximizes back, the swap never leaves a moment without text, a joiner reads "Being prepared on Ana's device" then gets the text; and a second case measures the Create editor alone.
