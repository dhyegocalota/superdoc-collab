# Test plan: Open progress

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/open-progress/open-progress-panel.test.tsx` — input: panel at Preparing with a fraction of 12,400 over 56,800; expected: progressbar `aria-valuenow` 22 and the detail line
- [ ] Confirmed it fails for the right reason: the stub throws `OpenProgressPanel is not implemented`

## Unit

- [ ] `use-delayed-reveal.test.ts` — input: 399 ms then 1 ms; expected: false then true; a reset key restarts the clock
- [ ] `open-progress-panel.test.tsx` — each stage: the current stage has `aria-current="step"`, earlier stages are done, later are pending
- [ ] Indeterminate: Downloading has a progressbar without `aria-valuenow`
- [ ] `use-opened-document.test.tsx` — a 200 with Preparing is Waiting and polls every `PREPARING_POLL_MS`; Queued polls every `DOCUMENT_READY_POLL_MS`; Failed is `DocumentReadiness.Failed`; Ready is `DocumentReadiness.Ready` and exposes the data
- [ ] `waiting-for-document.test.tsx` — the Preparing panel shows after the reveal, not before
- [ ] `use-editor-open-progress.test.ts` — not synced: Downloading with the size; synced: Rendering with the pages; first fragment: no view
- [ ] `use-upload-document.test.tsx` — progress events become `progress`; it returns to null on success and on failure
- [ ] Edge: Preparing with `done` 0 — indeterminate bar, detail with the file size and the elapsed time
- [ ] Edge: a document that opens before the delay — no panel was ever rendered
- [ ] Edge: `prefers-reduced-motion` — the spinner and the pulse carry `motion-reduce:animate-none`

## E2E (Playwright specs)

- [ ] `e2e/open-progress.spec.ts::the Preparing panel names the wait, then the file being converted, then fills with the bytes done` — steps: script open answers Queued, Preparing 0, Preparing 40%, Preparing 80% of 1,000,000 bytes, then the real answer; expected: stage Preparing, detail "Waiting for its turn", then "Converting a", an indeterminate bar, then `aria-valuenow` 40, then 80, then the editor with no panel
- [ ] `e2e/open-progress.spec.ts::a joiner of a large document watches the download tick and the panel leaves at the first paragraph` — steps: the owner opens the large fixture, a second member opens it through a share link; expected: stages in order Preparing, Downloading, Rendering without going back, more than two distinct detail lines, no panel once the first paragraph is visible
- [ ] `e2e/open-progress.spec.ts::uploading a large document fills the bar with the bytes sent before the page opens` — steps: throttle the upload to 2 MB/s, upload the large fixture from the documents home; expected: the upload bar's value never decreases, shows more than one value and more than one detail line, then the document page opens
- [ ] `e2e/open-progress.spec.ts::a normal document leaves no panel behind once its first paragraph is visible` — steps: open a one-paragraph document; expected: no panel once the paragraph is visible, and any stage seen was Downloading or Rendering. The panel does show for about a second on this open because it takes 1.5 to 1.8 s against a 400 ms delay; the no-flash rule is proven by the unit tests

## Prove it for real — Playwright MCP

- [ ] Happy path: upload the large fixture, expected: upload bar with bytes, the stage list moves, the editor opens
- [ ] Failed preparation: expected: the existing error card and Back to documents
- [ ] Desktop width 1280 and narrow width 375, no sideways scroll
- [ ] Reduced motion: no animation in the panel
- [ ] Screenshots at `.pr-media/open-progress/`

## Edge cases found during execution

Empty on purpose.
