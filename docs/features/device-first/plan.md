# Plan: Device first

**Spec:** spec.md
**Tier:** 🔴
**Seam:** `useUploadDocument` (the flag), `POST /api/documents` and `storeDocument` (honour it), `RoomBootstrap` (register a device job on request), `DocumentPage` and `LocalPreview` (panel lifetime).
**Assumptions (decided, owner can override):**
- The web sends the flag whenever the device is device-first (wide layout, reports 8 GB); the server decides by weight, so the web never parses the DOCX.
- The device job's estimate uses its own rate constant, not the server's measured rate.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `libs/types/src/`, `apps/server/src/collaboration/`, `apps/server/src/documents/` | `dev-device-first` |
| G2 | `apps/web/src/features/documents/`, `editor/`, `local-preview/`, `open-progress/` | `dev-device-first` |
| G3 | `e2e/device-first.spec.ts`, `docs/features/`, `.claude/rules/` | `dev-device-first` |

## Sequencing

G1, G2, then G3.

## Steps

### G1

- [x] **Step 1:** route and registry: a heavy file with the flag is stored as a device job, a light file is prepared by the server, the heap refusal stays; red tests first. Evidence: 6f756236 (red), 08e9a9d1 (red), c180f455.
- [x] **Step 2:** device estimate: `DEVICE_MS_PER_MEGABYTE` drives the device job's `estimatedMs`. Evidence: 08e9a9d1 (red), c180f455.

### G2

- [x] **Step 3:** the upload hook sends the device flag when the guard passes. Evidence: 6bcd42a0 (red), 022679d9.
- [x] **Step 4:** the device panel shows the estimate and stays until the editor is ready and painted. Evidence: d58e17ab (red), 88c93e7e.
- [x] **Step 5:** the server-path panel sits over the preview pages until the swap ends; the status line is removed. Evidence: 5c21c6b8 (red), aca73cf4.

- [x] **Step 7:** the panel minimizes to a thin bar with the stage and the estimate and maximizes back, on both paths. Evidence: 7917ef9d (red), 02048eaf.
- [x] **Step 8:** the device path mounts the preview from the kept file while the Create editor converts, freezes it at the first painted paragraph and drops it when the editor is usable. Evidence: 0a809e3b (red), ee0157f6.

### G3

- [x] **Step 6:** E2E case and measurements; docs. Evidence: `e2e/device-first.spec.ts` green, measured table in the spec.
- [x] **Step 9:** E2E for the preview on the device path, the minimize control, the swap keeping text, and the memory figures of the overlap and of the Create editor alone. Evidence: fc9a847e, 7cda2569; measured table in the spec.
- [x] **Step 10:** the memory figures put the overlap above 4 GB, so the device-path preview mounts only on a device that reports 8 GB. Evidence: 7cda2569 (red), 171f936c.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A forged flag fills heavy rooms | the heavy room admission refuses | the guards stay on the honoured flag |
| 4 | The panel never leaves | the editor never reports ready | the panel ends when the editor fails |

**Steps with no backout:** none

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md`.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict.
- [ ] **/check-ui:** screenshots and video recorded.
- [ ] **/open-pr:** gates passed, PR opened.
