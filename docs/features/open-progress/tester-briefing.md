# Tester briefing: Open progress

Written by the developer of lane `lane/instant-progress`. Every "works" below is a hypothesis for you to refute.

## What changed

- The open answer is read as `OpenedDocument & { bootstrap }`. Readiness follows `bootstrap.stage`; `data` reaches the page only once Ready; `bootstrap` reaches it at every stage; the poll is 1 s while Preparing.
- A centred `OpenProgressPanel` (title, stage list, bar, detail line) shows on the waiting page for Preparing and over the editor for Downloading and Rendering, after 2 s, until the first `.superdoc-fragment`.
- The upload uses `XMLHttpRequest` and the dialog and the drop zone show bytes sent over bytes total.
- New: `components/ui/progress.tsx`, `features/open-progress/`, `features/documents/upload-progress-status.tsx`, `lib/format-quantity.ts`, `lib/api.ts` `apiSendWithProgress`, three constants in `libs/types`.

## How to run

```
pnpm --filter @superdoc-collab/web test:unit
pnpm exec playwright test e2e/open-progress.spec.ts
```

## Red first (commit, failure text the red run printed)

| Commit | Red message |
|--------|-------------|
| 7f768c61 | formatCount, formatByteCount, useDelayedReveal and OpenProgressPanel are not implemented |
| 74526270 | expected 'ready' to be 'waiting'; expected 'ready' to be 'failed'; expected fetch to be called 2 times, but got 1 times |
| a7ee2d77 | uploadingView, preparingView, downloadingView and renderingView are not implemented; Unable to find an element by [data-testid="open-progress"] |
| a3d9a7bf | useElapsedSeconds, useHasPaintedParagraph and editorOpenView are not implemented; Unable to find an element by [data-testid="open-progress"] |
| ba985ca9 | expected the last call to be { isSynced: false, pageCount: 0, hasFailed: false } |
| 8d00c15a | apiSendWithProgress is not implemented; UploadProgressStatus is not implemented; no upload request was sent |

Pins, green when they landed: the document page tests "a Failed bootstrap shows the error card instead of a panel" and "a document painted before the delay never shows the panel".

## Hypotheses to attack

- A document that opens in under 2 s never renders the panel (document page test with a real 2.1 s wait).
- The panel never covers the Failed connection banner or the file error.
- A reload (editor generation change) brings the panel back until the first paragraph paints again.
- With reduced motion on, nothing in the panel animates.
- 375 px: no sideways scroll, the card fits with 16 px margins.

## What could not be observed from SuperDoc

- Bytes or frames received: the provider and its socket live in SuperDoc's worker, so Downloading shows only the state size (when the server sends it) and the elapsed time.
- The total page count: Rendering shows pages laid out so far. For a joiner the first paragraph paints so soon after sync that Rendering did not appear in 100 ms samples.
- Real numbers during Preparing: lane-bootstrap reports `done` 0 until Ready, so Preparing is indeterminate until the server reports more; a scripted answer proves the determinate path.

## Dead path removed

The 409 not-ready answer, `DocumentReadiness.Paused`, Keep waiting, the give-up count and `DOCUMENT_READY_GIVE_UP_MS` are gone; a Queued or Preparing bootstrap is the only wait.
