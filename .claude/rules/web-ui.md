---
paths:
  - "apps/web/**"
---

# Web UI

## React events and state
- A key handler that decides from React state can read a stale closure in a real browser while jsdom passes. Decide from `event.currentTarget.value`. (apps/web/src/features/timeline/filter-box.tsx, docs/learnings/2026-10-17-a-key-handler-that-reads-react-state-sees-the-previous-keystroke.md)
- A handler that consumes a key calls `event.preventDefault()`; document-level handlers check `event.defaultPrevented` and stand down. (filter-box.tsx, apps/web/src/features/timeline/use-time-travel.ts, apps/web/src/features/editor/superdoc-editor.tsx)
- A container that unmounts and remounts (a collapsed panel) is measured through a callback ref, never a ref object read once in an effect. (apps/web/src/lib/use-element-width.ts)
- `scrollIntoView` runs on state transitions only (running → result), never on every key change and never on the first render with a cached result. (apps/web/src/features/timeline/selection-summary-card.tsx)
- `Intl.DateTimeFormat` instances are module constants, built once. (apps/web/src/lib/format-date-time.ts)

## Focus and keyboard
- A Radix `Dialog` opened without a `DialogTrigger` returns focus to `body` on close. Pass `onCloseAutoFocus` that prevents the default and focuses the opener. (apps/web/src/features/editor/editor-header.tsx, docs/learnings/2026-10-17-a-radix-dialog-without-a-trigger-drops-focus-to-body.md)
- A Dialog opened from a dropdown item needs the menu `modal={false}`, or closing leaves `pointer-events: none` on `body`. (refinement-ux-care spec)
- A roving tabindex gives exactly one element `tabIndex 0` and the rest `-1`; tests pin exactly that. (apps/web/src/features/timeline/streamgraph.tsx)
- A tooltip shown on keyboard focus but not after a pointer selection resets its keyboard flag on pointer press, not only on focus, and ends the press on release. (streamgraph.tsx)
- A sentinel that receives focus is visible while focused (`sr-only focus:not-sr-only`). (superdoc-editor.tsx)
- A `keydown` inside an iframe never reaches the parent. Forward the intent with a typed `postMessage`, validated by origin and source. (apps/web/src/features/versions/version-view-page.tsx, docs/learnings/2026-10-17-keydown-inside-an-iframe-never-reaches-the-parent.md)

## Copy
- Every string lives in a `*-copy.ts` file or `libs/types`, never inline in JSX. (apps/web/src/lib/app-copy.ts, features/*/…-copy.ts)
- A message with a verb is a sentence and ends with a period; labels, headings and noun-phrase states ("No edits yet", "Link copied") do not. (refinement-ux-care spec P2-17)
- The ellipsis is `…`, never `...`. (refinement-ux-care spec P2-17)
- A disabled control carries a visible reason, linked with `aria-describedby`. (docs/learnings/2026-10-17-a-disabled-button-never-shows-its-title.md)

## SuperDoc 2.23.0 in the browser
- The editing surface is a `textarea`, not a contenteditable; in viewing mode it is a `role="document"` element. (`EDITING_SURFACE_SELECTOR` in superdoc-editor.tsx, `EDITOR_INPUT_SELECTOR` in e2e/editor.ts)
- A programmatic `focus()` on a fresh blank document before the user's first click, from `onReady` or `onCollaborationReady`, leaves the composition textarea focused without a selection, and the first keystroke throws "This edit couldn't be completed". Never auto-focus a new document. (docs/learnings/2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md)
- `zoom: { mode: 'fit-width' }` in the config, and `setZoomMode`, `setZoom` and `focus()` on the instance, exist. (apps/web/src/features/editor/superdoc-zoom.ts)
- Inside the same-origin version iframe, `window.matchMedia` measures the frame; pass `window.parent` as the viewport to measure the page. (superdoc-zoom.ts, apps/web/src/features/versions/version-viewer.tsx)
- `ui: { comments: { layout: 'auto', responsive: { breakpoint } } }` moves the tracked-change and comment cards inline below the breakpoint; the default sidebar layer squeezes the page to a thumbnail at 375 px. (apps/web/src/features/editor/superdoc-options.ts)
- Comment highlight colours come from `--sd-comment-highlight-internal` and `--sd-comment-highlight-external`. (apps/web/src/styles/globals.css)
