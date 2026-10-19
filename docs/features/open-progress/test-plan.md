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

- [ ] `e2e/open-progress.spec.ts::preparing shows its stage and a rising bar` — steps: script open answers Queued, Preparing 0 of N, Preparing 40% of N, then continue to the real answer; expected: the panel at Preparing with an indeterminate bar, then a bar of 40, then the editor
- [ ] `e2e/open-progress.spec.ts::a large document shows its stages in order` — steps: upload the large fixture, open it; expected: Downloading, then Rendering with a non-decreasing page count, then no panel once the first paragraph is visible
- [ ] `e2e/open-progress.spec.ts::a small document never shows the panel` — steps: upload a one-paragraph document; expected: the panel is never in the page

## Prove it for real — Playwright MCP

- [ ] Happy path: upload the large fixture, expected: upload bar with bytes, the stage list moves, the editor opens
- [ ] Failed preparation: expected: the existing error card and Back to documents
- [ ] Desktop width 1280 and narrow width 375, no sideways scroll
- [ ] Reduced motion: no animation in the panel
- [ ] Screenshots at `.pr-media/open-progress/`

## Edge cases found during execution

Empty on purpose.
