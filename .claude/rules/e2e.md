---
paths:
  - "e2e/**"
  - "playwright.config.ts"
---

# E2E authoring

## Runner
- The app suite runs file-level parallel: 4 workers in CI, half the cores locally, never `fullyParallel`. The POC's `workers: 1` does not apply. (playwright.config.ts, ADR 0018)
- The stack binds port 3100 and the fake model port 3199, both constants, and never reuses a running server: a second stack on the same machine needs a scratch config with other ports. (playwright.config.ts, e2e/fake-openrouter-origin.ts)
- Specs share one server and one fake model per run. Never assert a process-wide counter without isolating it per document. (docs/learnings/2026-10-17-a-process-wide-call-counter-breaks-parallel-specs.md)

## Typing
- Text typed keystroke by keystroke can be projected as two runs, and can straddle a ten-second bin, on a loaded runner; a term filter then matches neither half. Insert fixture and marker text as one input event (`insertInParagraph`, `page.keyboard.insertText`) whenever a test relies on it being one run or matching a term. (e2e/editor.ts, docs/learnings/2026-10-17-text-typed-keystroke-by-keystroke-can-land-in-two-runs.md)
- Keep `typeInParagraph` for tests about typing itself: focus recovery, convergence under concurrency, per-keystroke attribution. (e2e/editor.ts)
- The fake model fails on a marker (`FAIL-TOPICS`, `FAIL-SUMMARY`) only when the marker appears whole in one prompt edit, so a marker is always inserted as one event. (e2e/fake-openrouter.ts)

## Waiting for the projection
- Before summarizing or filtering on just-typed text, wait until the projected events contain it (`insertedBy` over `readEvents`) and the timeline has settled (`waitForSettledTimeline`). (e2e/editor.ts, e2e/timeline.ts)
- `waitForBands` only proves the bands are drawn; it is never enough for the waits above. (e2e/timeline.ts)
- Choose a bin by its index only after the timeline settles (`waitForSettledTimeline`): a stream of keystrokes can spill into the next bin after the first read, and stepping back from End by the stale count lands one bin early, on a version with half the edit. (e2e/time-travel.spec.ts `openEditBin`, CI runs of PR #23)
- A version inside the live bin (the one that contains now) keeps moving while events arrive, and a member joining the room can add a newer version mark. Open a shared `?at=` link for a second member only after the timeline settles, then reload the first member so both pin the same settled version. (e2e/time-travel.spec.ts, commit 36aabe3)
