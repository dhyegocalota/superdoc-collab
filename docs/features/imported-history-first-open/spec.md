# Imported history on first open

**Status:** Shipped 2026-10-20
**Tier:** 🟢
**Owner approval:** approved 2026-10-20
**ADRs:** [0011](../../adr/0011-process-wide-llm-cost-caps.md), [0012](../../adr/0012-selection-summaries-cached-per-filter-and-cursor.md), [0031](../../adr/0031-one-summarize-job-runs-only-what-is-stale.md), [0043](../../adr/0043-a-known-version-sequence-resolves-exactly-and-marks-anchor-the-timeline.md)
**Not changing:** the Summarize job, its cooldown and budgets, live-edit bins, the version viewer.

## Problem

An evaluator who uploads a DOCX with tracked changes or comments sees two things go wrong on first open. A bin that holds only imported events keeps "Loading this version…" forever, because it asks for sequence 0, which the log does not have. The summary of the whole history waits for a click on Summarize edits, then takes 5 to 30 s.

## Goals

- A bin of only imported events opens the document as uploaded (the bootstrap mark), and the banner says "Document as uploaded, <moment>".
- The first time an editor or owner opens a document whose timeline has imported authors and no summary of the whole document yet, the Summarize job starts by itself and the edits panel opens, so the summary is on screen without a click.

## Non-goals

- Summaries for filtered selections, readers, documents with no imported history, or a server-side run at upload.

## Design

### Data flow

- Server: `versionSequenceResolver` treats the imported sequence like no event, so the bin falls back to the first mark, the bootstrap.
- Web: `useImportedHistorySummary` watches the timeline once the editor has painted. When the URL has no filter, topic or time, the caller may request, the timeline has an `imported:` author and the whole-document summary is `None`, it calls `summarizeAndOpenPanel` once. In every other case it decides once and stops watching.

### Interfaces

- `IMPORTED_SEQUENCE` exported from `libs/history`.
- `uploadedVersionLabel` in `timeline-copy.ts`.
- `ProjectionStatus.isImporting`, from `ProjectionScheduler.isImporting`: the hook waits while the upload's import is pending, because the first timeline after a fast bootstrap can arrive before the imported authors.

### Failure handling

The job answers busy, unavailable or cooling down through the existing card, exactly as after a click. The auto-start never retries.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Where does the auto-run start | At upload on the server / on first open in the browser | First open: it spends a model call only on documents someone opens, after the room is prepared, so the summary is not stale at birth | 2026-10-20 |

## Test strategy summary

A server route test for the bin's version, a component test for the banner label, hook tests for start and no-start, and a scripted walk on the scenario stack with the fake model.
