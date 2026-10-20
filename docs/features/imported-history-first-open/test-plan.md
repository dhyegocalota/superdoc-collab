# Test plan: Imported history on first open

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `.

## The failing test first

- [x] `apps/server/src/history/timeline-routes.test.ts::a bin of only imported events opens the document as uploaded, the bootstrap mark` — input: a bootstrapped document plus one imported comment on 2026-02-13; expected: that bin's `versionSequence` is the bootstrap mark — evidence: red with `- 1 + 0`, green after (29/29)
- [x] Confirmed it fails for the right reason: received 0, the imported sequence the log does not have

## Unit

- [x] `apps/web/src/features/versions/time-travel.test.tsx::a bin older than the version it opens says the document is shown as uploaded` — input: a bin whose version is a day after its end; expected: "Document as uploaded on …" — evidence: 35/35
- [x] `use-imported-history-summary.test.tsx::starts once for imported history that was never summarized` — expected: `onStart` once — evidence: 4/4
- [x] `use-imported-history-summary.test.tsx::does not start for a document without imported history` — expected: no start, no summary request — evidence: 4/4
- [x] `use-imported-history-summary.test.tsx::does not start when the summary is already written` — expected: no start — evidence: 4/4
- [x] `use-imported-history-summary.test.tsx::waits while the import runs, then starts once the imported authors arrive` — expected: no start while importing, one start after — evidence: 5/5
- [x] `use-imported-history-summary.test.tsx::does not start for a reader or on a filtered view` — expected: no start, no request — evidence: 4/4

## Prove it for real — Playwright

- [x] Happy path: upload a DOCX with a tracked change and a comment; expected: once the editor paints, the edits panel opens and the summary card runs, then shows a sentence — evidence: scenario stack with the fake model, the POST left 1.0 s after the first paragraph painted, the panel opened with "Dana Reviewer and Chris edited 2 passages." (`first-open-summary-1280.png`)
- [x] Imported bin: open the comment's bin; expected: the frame loads and the banner reads "Document as uploaded, …" — evidence: the bin answered the bootstrap sequence and the banner read "Document as uploaded, 9:21:35 PM" (`imported-bin-as-uploaded-1280.png`)
- [x] Reopen: reload the page; expected: no new summarize request — evidence: 0 summarize POSTs on reopen
- [x] Console and network clean — evidence: no console error, no failed request, no 4xx/5xx
- [x] Screenshots at `.pr-media/imported-history-first-open/` — evidence: two PNGs at 1280

## Edge cases found during execution

- [x] The first timeline can arrive before the import finishes, so the hook decided "no imported history" and never started — fixed with `isImporting`; regression `use-imported-history-summary.test.tsx::waits while the import runs, then starts once the imported authors arrive`

## Adversarial review

Skipped on the owner's request (fastest path).

## Coverage honesty

- A document whose imported history is later edited before anyone opens it still auto-summarizes once, on the edited state.
