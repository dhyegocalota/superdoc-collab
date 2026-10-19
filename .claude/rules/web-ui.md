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
- Every time on screen goes through `apps/web/src/lib/format-date-time.ts` with the effective zone from `useTimeZone()` and the `en-US` locale; its `Intl.DateTimeFormat` instances are cached per zone and options. Nothing else formats a time. (ADR 0024)

## Layout
- Below `lg` the documents list is stacked rows (title clamped to two lines, one muted line), never a table, and no page scrolls sideways at 320 px. (apps/web/src/features/documents/document-table.tsx, docs/features/mobile-horizontal-scroll/spec.md)

## Focus and keyboard
- A Radix `Dialog` opened without a `DialogTrigger` returns focus to `body` on close. Pass `onCloseAutoFocus` that prevents the default and focuses the opener. (apps/web/src/features/editor/editor-header.tsx, docs/learnings/2026-10-17-a-radix-dialog-without-a-trigger-drops-focus-to-body.md)
- A Dialog opened from a dropdown item needs the menu `modal={false}`, or closing leaves `pointer-events: none` on `body`. (refinement-ux-care spec)
- A roving tabindex gives exactly one element `tabIndex 0` and the rest `-1`; tests pin exactly that. (apps/web/src/features/timeline/streamgraph.tsx)
- A tooltip shown on keyboard focus but not after a pointer selection resets its keyboard flag on pointer press, not only on focus, and ends the press on release. (streamgraph.tsx)
- A sentinel that receives focus is visible while focused (`sr-only focus:not-sr-only`). (superdoc-editor.tsx)
- A `keydown` inside an iframe never reaches the parent. Forward the intent with a typed `postMessage`, validated by origin and source. (apps/web/src/features/versions/version-view-page.tsx, docs/learnings/2026-10-17-keydown-inside-an-iframe-never-reaches-the-parent.md)

## Theme and panel position
- The theme applies before the first render: an inline script in `index.html` reads `superdoc-collab.theme` and adds `dark` to `html` before the bundle runs, and `useTheme()` listens to the `storage` event so another tab follows. The script cannot import, so a test pins its key to `THEME_STORAGE_KEY`. (apps/web/index.html, apps/web/src/lib/use-theme.ts, apps/web/src/lib/theme-script.test.ts)
- The version frame is same-origin: it runs the same inline script and receives the same `storage` event, so it follows the theme with no message. (apps/web/src/features/versions/version-view-page.tsx)
- The panel position lives under `superdoc-collab.edits-panel` as a `PanelPosition`. Below `LARGE_BREAKPOINT_PX` it is always `Bottom`; with no stored value it follows `WIDE_BREAKPOINT_PX` live; a stored value that is not a `PanelPosition` is removed. (apps/web/src/features/timeline/use-panel-position.ts, apps/web/src/lib/breakpoints.ts)
- SuperDoc's local caret is an overlay `div` painted with `currentColor`, so `caret-color` does nothing; colour it through `[data-v2-local-selection-caret='true']`. (apps/web/src/styles/globals.css, docs/features/dark-theme/spec.md)

## Copy
- Every string lives in a `*-copy.ts` file or `libs/types`, never inline in JSX. (apps/web/src/lib/app-copy.ts, features/*/…-copy.ts)
- A message with a verb is a sentence and ends with a period; labels, headings and noun-phrase states ("No edits yet", "Link copied") do not. (refinement-ux-care spec P2-17)
- The ellipsis is `…`, never `...`. (refinement-ux-care spec P2-17)
- A disabled control carries a visible reason, linked with `aria-describedby`. Exception: while the document loads, SuperDoc's loading overlay on the paper is the visible reason, so the Download description may be screen-reader only. (docs/learnings/2026-10-17-a-disabled-button-never-shows-its-title.md)

## Banners
- A page-level state banner (`ConnectionBanner`, `VersionBanner`) sits full width between the top bar and the content, carries `data-testid` and `data-state`, and wraps its action under the text at narrow widths (`flex-wrap`, `gap-2`, `px-4 py-2`, `text-sm`). `role="status"` announces progress; only a failure uses `role="alert"`. A spinner carries `motion-reduce:animate-none`. (apps/web/src/features/editor/connection-banner.tsx, apps/web/src/features/versions/version-banner.tsx)

## SuperDoc 2.23.0 in the browser
- The editing surface is a `textarea`, not a contenteditable; in viewing mode it is a `role="document"` element. (`EDITING_SURFACE_SELECTOR` in superdoc-editor.tsx, `EDITOR_INPUT_SELECTOR` in e2e/editor.ts)
- Any focus of a fresh blank document without a click (a programmatic `focus()` from `onReady` or `onCollaborationReady`, or a browser-tool fill of the textarea) leaves the composition textarea focused without a selection, and the first keystroke throws "This edit couldn't be completed". Never auto-focus a new document; drive it with a click, End and key presses. (docs/learnings/2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md, docs/learnings/2026-10-18-an-mcp-fill-on-a-blank-superdoc-surface-is-rejected-because-no-selection-exists.md)
- `onException` reports `code: 'edit-rejected'` once per rejected document-surface event (key, paste, cut, drop, pointer up), for example a keystroke aimed at a paragraph another author deleted; the instance keeps syncing, so the editor shows a status line instead of the fatal message (`exceptionOutcome` in superdoc-exceptions.ts). (docs/features/editor-survives-rejected-edits/)
- `zoom: { mode: 'fit-width' }` in the config, and `setZoomMode`, `setZoom` and `focus()` on the instance, exist. (apps/web/src/features/editor/superdoc-zoom.ts)
- The version viewer fits the page to the frame width with the shared `FIT_WIDTH_ZOOM` (`fit-width`, capped at 100 %) and `FITTED_PAGE_CLASS`, and passes no toolbar container. It takes the author palette from `authorPaletteOf`, the helper the live editor uses. (apps/web/src/features/editor/superdoc-zoom.ts, apps/web/src/features/versions/version-viewer.tsx)
- `ui: { comments: { layout: 'auto', responsive: { breakpoint } } }` moves the tracked-change and comment cards inline below the breakpoint; the default sidebar layer squeezes the page to a thumbnail at 375 px. (apps/web/src/features/editor/superdoc-options.ts)
- A remote caret in the overlay (`.v2-collaboration-overlay__remote-caret`) carries no client or user id in the DOM, only its label text (the peer's own name), `data-peer-rank` and its background colour. A caret belongs to a member only when label and colour both match the member's name and `--author-N` colour, and exactly one caret matches. A peer can still forge both; the limit is a jump to the wrong cursor, never an edit. (apps/web/src/features/editor/use-member-cursors.ts)
- Comment highlight colours come from `--sd-comment-highlight-internal` and `--sd-comment-highlight-external`. (apps/web/src/styles/globals.css)
- The toolbar is `ui.toolbar` with a `container`, `responsiveTo: 'container'` and `excludeItems`; the list is declared `satisfies readonly ToolbarItemId[]` so a name SuperDoc does not know fails the typecheck. The container is `inert` while a past version shows, and the Summarize button sits outside it. (apps/web/src/features/editor/superdoc-options.ts, apps/web/src/features/editor/editor-toolbar-row.tsx)
- The top-bar Find button calls `superdoc.emit('search:open')`, the event the toolbar's search item sends. `ui.search.open()` returns ok and mounts nothing. `ui.search: true` is what makes Cmd+F and Ctrl+F work. (apps/web/src/features/editor/find-button.tsx)
- The print view is a non-collaborative viewing-mode SuperDoc with `layoutEngineOptions.virtualization.enabled: false`. Virtualization off still paints only the pages near the viewport, so its container is sized to the `.superdoc-page` count times 1056 px, and `window.print()` runs only after every page holds a `.superdoc-fragment` (a blank page has a fragment and no text), found with a bounded `requestAnimationFrame` loop, never a timer. (apps/web/src/features/versions/print-view.tsx, docs/features/final-visuals/spec.md)
- `user.color` must be a six-digit hex: hsl, rgb and named colours are stored but the remote-caret overlay replaces them with a palette colour. The `--author-N` tokens are therefore declared as hex and read with `getComputedStyle`. (apps/web/src/features/editor/superdoc-editor.tsx, apps/web/src/styles/globals.css)
- Awareness carries only user fields, no cursor and no block id, and `scrollToElement` returns false for every id. A jump to a member finds the `.v2-collaboration-overlay__remote-caret` whose label carries the name and calls `scrollIntoView`; no caret element means online but not in the document. (apps/web/src/features/editor/use-member-cursors.ts)
