# Open progress: a loading that shows real progress, so a long document never feels stuck

**Status:** Building
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 ("um loading mais friendly com progressão real de ui/ux pra não feel stuck especialmente pra docs longos")
**ADRs:** none; the stages and the delay are constants, not a decision with alternatives.
**Not changing:** the server, the collaboration protocol, SuperDoc, the connection banner, the error copy, the upload size cap.

## Problem

A 9.5 MB document with 56,800 paragraphs takes minutes to open. The page shows a skeleton and one sentence, "Preparing the document…", then SuperDoc's own overlay, with no number that moves. Each step looks the same as a hang.

## Goals

| Goal | Rule |
|------|------|
| One panel | A centred panel in the editor page area shows the document title, a list of stages with the current one highlighted, a bar and one line of live detail. |
| Real numbers | The bar is determinate whenever a real number exists and indeterminate only when none does. |
| Nothing looks stuck | The detail line changes at least once a second in every stage. |
| No flash | The panel appears only `OPEN_PROGRESS_DELAY_MS` (400 ms) after the page opens, and never disappears and returns during one open. |
| Failure | A failed preparation shows the existing error card with Back to documents. |
| Accessible | The current stage is a polite `role="status"`, the bar is a `progressbar` with `aria-valuenow` when determinate, reduced motion stops every animation. |
| Mobile | The panel fits 375 px with no sideways scroll. |

## Non-goals

- Counting socket frames. SuperDoc runs its provider inside a worker and exposes only `sendStateless` ([SuperDoc 2.23.0 types](../../../.claude/rules/web-ui.md)), so the main thread cannot see the bytes received. Downloading shows the size from the open answer and the elapsed time, on an indeterminate bar.
- An expected page count. SuperDoc reports the pages laid out so far, never the total. Rendering shows that count growing, on an indeterminate bar.

## Design

### Stages

| Stage | Where | Bar | Detail line |
|-------|-------|-----|-------------|
| Uploading | documents home, in the upload dialog and drop zone, before navigation | determinate: bytes sent over bytes total, from the request's upload progress | `4.2 MB of 9.5 MB` |
| Preparing | editor page, while the open answer's bootstrap is Queued or Preparing | determinate only when `done` is above 0; otherwise indeterminate | `Converting a 9.5 MB file · 12 s`, or `Waiting for its turn · 12 s` while Queued |
| Downloading | editor page, from the first render of SuperDoc until collaboration reports synced | indeterminate | `Receiving 36.5 MB · 12 s` |
| Rendering | editor page, from synced until the first `.superdoc-fragment` is in the page | indeterminate | `Laying out the pages · 123 so far · 12 s` |

The server-bootstrap lane reports `total` as the DOCX size in bytes and `done` as 0 until the room is committed, because the SDK offers no number during the conversion. The web renders any `done` above 0 as a determinate bar of bytes, so a server that reports more is shown without a web change. The paragraph count is unknown to the web, so Rendering counts the pages SuperDoc has laid out so far.

The panel is gone once the first paragraph is visible. The stage list on the editor page holds Preparing, Downloading and Rendering; Uploading belongs to the home page, which the person has already left.

### Data flow

The open answer is 200 for every stage and carries `bootstrap: BootstrapProgress`. `readinessOf` maps Queued and Preparing to Waiting, Failed to Failed and Ready to Ready. The poll runs every `PREPARING_POLL_MS` (1 s) while the stage is Preparing and every `DOCUMENT_READY_POLL_MS` otherwise. `data` exposed to the page is the answer only once Ready; `bootstrap` is exposed for every stage. The legacy 409 not-ready path stays as it is and reports no bootstrap, so it renders Preparing on an indeterminate bar with the elapsed time.

`SuperDocEditor` reports two facts upward: collaboration synced (`onCollaborationReady`) and the page count (`onPaginationUpdate`). `DocumentPage` watches the editor container for the first fragment and builds one view for the panel. `useDelayedReveal` starts when `DocumentPage` mounts, so the Preparing and the editor panels share one 400 ms clock, and the elapsed seconds in the detail line count from the same moment.

Upload uses `XMLHttpRequest` because `fetch` reports no upload progress over HTTP/1.1; the helper resolves a `Response`, so `uploadDocument` keeps its status handling.

### Interfaces

- `Progress` in `components/ui/progress.tsx`, the shadcn component over `radix-ui`.
- `OpenProgressPanel` takes the title, the stage list, the current view (stage, detail, fraction or null) and an action slot.
- `useUploadDocument` returns `progress: { sentBytes, totalBytes } | null`.
- `libs/types`: `OPEN_PROGRESS_DELAY_MS`, `PREPARING_POLL_MS`, `BYTES_PER_KILOBYTE`.
- The open answer is read as `OpenedDocument & { bootstrap: BootstrapProgress }` until the server-bootstrap lane adds the field to `OpenedDocument`.

### Failure handling

| Failure | Behaviour |
|---------|-----------|
| Bootstrap Failed | The existing "could not be loaded" card with Try again and Back to documents |
| The upload fails | The existing upload message; the bar disappears |
| Fast open under 400 ms | No panel at all; SuperDoc's own overlay is untouched |
| The main thread is busy laying out | The detail line stops until the layout pass ends; the bar's animation runs on the compositor and keeps moving |

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| What should loading look like for long documents? | spinner only / stage list with real numbers | "um loading mais friendly com progressão real de ui/ux pra não feel stuck especialmente pra docs longos" | 2026-10-19 |

## Test strategy summary

Unit tests for every stage view, the no-flash rule, the readiness from the bootstrap stage, the poll interval, the upload progress and the formatters. E2E in `e2e/open-progress.spec.ts`: scripted Preparing answers show the stage and a rising bar, the large fixture shows Downloading then Rendering with a growing page count and the panel leaves at the first paragraph, a normal document never shows the panel.
