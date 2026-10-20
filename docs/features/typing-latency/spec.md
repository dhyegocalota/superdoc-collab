# Typing latency: a keystroke in a large document lays out a window of pages, not the whole document

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-20 (requirement 39). The owner typed in the 9.5 MB document in production and saw seconds per keystroke and a frozen screen.
**ADRs:** none; one option on the editor, measured.
**Not changing:** the collaboration provider, the update log, the local preview, the device path, the print view (it already disables virtualization), the SuperDoc version.

## Problem

In the 9.5 MB document (56,800 paragraphs, 2,185 pages) every keystroke made SuperDoc's layout engine lay out the whole document again. Measured on main 55676e5c with Playwright and Chrome DevTools Protocol, ten keystrokes at the start of the document: median 1,089 ms from keydown to the character on the page, max 1.5 s, 85 long tasks; in the middle, 48 ms median with 1 s spikes; a one-paragraph document, 24 ms. CPU attribution of the 15.7 s spent on those ten keystrokes: 7.5 s in SuperDoc's `docx-engine` (layout and pagination, `getBoundingClientRect`, `querySelectorAll`), 6.3 s in the browser's own layout and paint, 0.3 s in our code (three React commits and about 100 mutation-observer callbacks per keystroke, 2%). Nothing in our code made it slow; the editor's layout mode did. The three heads main, dd01452e (PR #81) and 8578dcb1 (PR #80) share the same SuperDoc build, so the cost predates today's work.

## Decision

The live editor's SuperDoc options carry `layoutEngineOptions.virtualization` with `enabled: true`, `window: 1`, `overscan: 0`: the engine lays out the pages around the viewport instead of all 2,185. The two constants live at the top of `apps/web/src/features/editor/superdoc-options.ts`. The option applies to every document: on a one-paragraph document and on the brief the pages are identical to the default (screenshots at the start, middle and end, with a second author's presence cursor and the authorship band, and in the version viewer), and on the large document the start page is identical. The preview keeps SuperDoc's default (it is read-only and short-lived), and the print view keeps `virtualization.enabled: false` as before so every page prints.

## Measured

Ten keystrokes at the start of the 9.5 MB fixture, Playwright plus CDP, one laptop under load, the typist joining as a second author:

| SuperDoc option | Median per keystroke | Max | Longest task |
|---|---|---|---|
| default | 1,089 ms | 1,524 ms | 249 ms |
| `flowMode: 'semantic'` | 683 ms | 1,132 ms | 157 ms |
| **`virtualization: { enabled: true, window: 1, overscan: 0 }`** | **102 ms** | **238 ms** | **154 ms** |
| `experimental.v2WebSurface: 'dense-control'` | the tab crashed | | |

The E2E `e2e/typing-latency.spec.ts` bounds the median under 150 ms and the longest task under 500 ms at the start and in the middle of the large document, as a regression guard. Production figures after the deploy are in the PR.

## Consequences

- The owner's complaint ("each keystroke takes seconds") is the layout of 2,185 pages per transaction; with a window of one page around the viewport a keystroke costs about 100 ms on this machine.
- Any view that must see every page at once (print, find across the document) runs with virtualization off; the print view already does.
- A page scrolled into view is laid out on arrival; a fast scroll to the end can show a page frame for a moment before its text paints.

## Known limits

- The 2% in our code (React commits and mutation callbacks per keystroke) stays; it is not attributable to one source in the profile.
- The bounds hold on this machine with margin, not on every machine.
