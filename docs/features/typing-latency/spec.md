# Typing latency: a keystroke in the 9.5 MB document costs about a second in SuperDoc's layout engine, and no editor setting brings it under 150 ms

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-20 (requirement 39). The owner typed in the 9.5 MB document in production and saw seconds per keystroke and a frozen screen.
**ADRs:** none; every SuperDoc layout option was measured and none is adopted.
**Not changing:** the collaboration provider, the update log, the local preview, the device path, the print view (it already disables virtualization), the SuperDoc version.

## Problem

In the 9.5 MB document (56,800 paragraphs, 2,185 pages) every keystroke made SuperDoc's layout engine lay out the whole document again. Measured on main 55676e5c with Playwright and Chrome DevTools Protocol, ten keystrokes at the start of the document: median 1,089 ms from keydown to the character on the page, max 1.5 s, 85 long tasks; in the middle, 48 ms median with 1 s spikes; a one-paragraph document, 24 ms. CPU attribution of the 15.7 s spent on those ten keystrokes: 7.5 s in SuperDoc's `docx-engine` (layout and pagination, `getBoundingClientRect`, `querySelectorAll`), 6.3 s in the browser's own layout and paint, 0.3 s in our code (three React commits and about 100 mutation-observer callbacks per keystroke, 2%). Nothing in our code made it slow; the editor's layout mode did. The three heads main, dd01452e (PR #81) and 8578dcb1 (PR #80) share the same SuperDoc build, so the cost predates today's work.

## Decision

No editor option is adopted. Every SuperDoc layout setting that could plausibly cut the per-transaction layout was measured on the 9.5 MB fixture with the same probe (ten keystrokes at the start of the document, Playwright plus Chrome DevTools Protocol, one laptop under load, the typist joining as a second author). None brings the keystroke under 150 ms; the best two cut it by about 40% and change how lines flow (`flowMode: 'semantic'`) or drop the page layout engine (`useLayoutEngine: false`), both unmeasured for fidelity, so they are not shipped. A spike's reading of 102 ms with the virtualization window came from an ad-hoc override and did not reproduce with the option in the build (929 ms with the spike's own harness), so the option is not kept either.

What ships: this measurement, the E2E `e2e/typing-latency.spec.ts` as a regression guard with the real numbers as bounds (median under 1.5 s and no task longer than 1 s at the start and in the middle of the 2,000-page document, so a change that makes it worse fails), a row in `docs/next.md`, and the issue draft below for SuperDoc.

## Measured

| SuperDoc option | Median per keystroke | Max | Longest task |
|---|---|---|---|
| default | 1,089 ms | 1,524 ms | 249 ms |
| `layoutEngineOptions.flowMode: 'semantic'` | 683 ms | 1,132 ms | 157 ms |
| `layoutEngineOptions.virtualization: { enabled: true, window: 1, overscan: 0 }` in the build | 929 ms | 1,893 ms | |
| `flowMode: 'semantic'` plus the virtualization window | 671 ms | 1,035 ms | 145 ms |
| `useLayoutEngine: false` (the legacy layout) | 658 ms | 1,726 ms | 157 ms |
| `experimental.v2WebSurface: 'dense-control'` | the tab crashed | | |

A one-paragraph document: 24 ms median. Keystrokes in the middle of the large document: 48 ms median with 1 s spikes (default).

## Issue draft for SuperDoc

Title: a keystroke in a 56,800-paragraph document lays out the whole document (about 1 s per key). Body: SuperDoc v2 with the layout engine, a DOCX of 9.5 MB (10 MB of `document.xml`, 2,185 pages) opened in a collaborative editor; ten keystrokes at the start of the document cost a median of 1,089 ms from keydown to the character on the page (Chrome 130, Apple silicon). A CPU profile over the ten keystrokes puts 7.5 s of 15.7 s in `docx-engine` (`advance` 2.6 s inclusive, `getBoundingClientRect` 0.55 s, `querySelectorAll` 0.17 s) and 6.3 s in the browser's layout and paint; the host page contributes 0.3 s. `flowMode: 'semantic'` gives 683 ms, `virtualization: { enabled: true, window: 1 }` 929 ms, `useLayoutEngine: false` 658 ms. Is there a way to lay out only the pages around the edit, or to defer the rest of the document's layout to idle time? A DOCX that reproduces it is attached (the fixture builder in this repository's `e2e/fixtures/large-docx.ts`).

## Consequences

- The owner's complaint ("each keystroke takes seconds") is the layout of 2,185 pages per transaction inside SuperDoc's engine; no setting of ours changes it, and the fix belongs to SuperDoc.

## Known limits

- The 2% in our code (React commits and mutation callbacks per keystroke) stays; it is not attributable to one source in the profile.
- The E2E bounds are the measured reality with margin, a guard against getting worse, not a target met.
