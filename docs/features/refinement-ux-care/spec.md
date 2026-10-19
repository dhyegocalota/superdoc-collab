# Refinement: UX care

**Status:** Shipped 2026-10-17
**Tier:** 🟡 (user-visible changes across every screen; no schema, no endpoint, no new dependency)
**Owner approval:** approved 2026-10-17 (refinement proposal)
**ADRs:** [0003](../../adr/0003-time-travel-with-native-yjs-snapshots.md) (version viewer in a same-origin frame), [0012](../../adr/0012-selection-summaries-cached-per-filter-and-cursor.md) (summary freshness)
**Not changing:** the history pipeline, every API shape, the summary cache key, the filter grammar, the editor's own key bindings, the time-travel keyboard path, auth flows.

Paths are written as they will be after lane B (structure) lands: `features/versions/{version-banner,version-frame,version-viewer,viewer-messages}`, `apps/web/src/lib/format-date-time.ts` (`formatTimestamp`, `formatBinRange`), `apps/web/src/lib/use-element-width.ts`, `apps/web/src/testing/`.

## Problem

The UX audit of 2026-10-17 (`audit-ux.md`, 35 findings, screenshots at 1280 and 375) found that the app works but explains itself poorly:

- There is no way back to the documents list from a document, and no app identity anywhere.
- The timeline chart has no axis, no hint and often no band names, so time travel is found by accident.
- Bin ranges print "7:45 AM – 7:45 AM" with the date twice; the units of the numbers disagree.
- "Summarize edits" puts its result out of sight, and collapsing the panel frees no space.
- The documents table shows raw enum values and clips on a phone; loading states are blank or full-screen grey.
- Dialogs lack Cancel, explanations and failure handling; copy mixes "..." and "…".
- On a phone the editor header takes three rows and the page scrolls sideways.

## Goals

One goal per audit item in scope. The test plan has one box per item.

| Item | Goal |
|------|------|
| P1-1 | The editor header starts with a home link (arrow and app name; the name hides below `sm`) that opens the documents list. |
| P1-2 | A collapsed timeline panel becomes a narrow rail on desktop: no width variable, no resize handle, only the toggle. |
| P1-3 | The chart shows its start and end time under the svg, a one-line hint on how to time-travel, and a legend of band names whenever a band has no label. |
| P1-4 | A bin range names its date once and adds seconds when bins are under a minute; the version banner always shows seconds. |
| P1-5 | The selection summary card renders under the filter box, styled as a card, and scrolls into view when a new result or the running state appears. |
| P2-1 | Every number carries its unit, pluralized, with a zero side hidden ("+2 words", "+11 characters"). |
| P2-2 | At 375 the editor header takes at most two rows: Download and Share are icon buttons below `sm`, Delete lives in a "More actions" menu at every width (folds P3-5). |
| P2-3 | Roles read "Owner", "Can edit", "Can view"; the "Mine" table drops the Owner and role columns. |
| P2-4 | The shared table hides Owner and Updated below `sm`, so nothing clips at 375. |
| P2-5 | The documents page has the app name and a "Documents" h1; every page sets `document.title` ("Plan · SuperDoc Collab"). |
| P2-6 | The documents page shows skeleton rows while loading; the document page keeps its header (home link and a title skeleton) while the document opens. |
| P2-7 | While an upload runs, the file input is disabled and "Uploading…" is announced. |
| P2-8 | The "New document" error renders under the section heading, outside the button row. |
| P2-9 | The delete dialog has a Cancel button. |
| P2-10 | Share dialog: "Reset link" with a description saying the old link stops working; skeleton rows while loading; a clipboard failure selects the input and says so; "Link copied" clears after three seconds. |
| P2-11 | Person filter chips read "@Bruno"; text chips do not. |
| P2-12 | An empty document shows only "No edits yet": no "Naming topics…", no empty "Top edits" heading, and Regroup topics disabled with a visible reason. |
| P2-13 | A new blank document shows a page on a muted backdrop and has the caret in it once the editor is ready. |
| P2-14 | Bin edit snippets render as `<ins>` and `<del>` on green and red tints, trimmed, without quotes; the version viewer highlights runs with the same green. |
| P2-15 | "No edits in this period" uses the panel's small muted text. |
| P2-16 | Presence avatars use a green online dot, announce "Ana, online", and show the current user online at once. |
| P2-17 | Copy uses "…" everywhere; messages with a verb end with a period, labels and noun phrases do not. |
| P2-18 | The share landing "Opening…" state is centred like its failure state. |
| P3-3 | Auth headings, field labels and cross-links come from `auth-copy.ts`. |
| P3-6 | The chart tooltip shows on hover and on keyboard focus, never pinned after a pointer selection. |
| P3-7 | The chart is one tab stop: only the active band has `tabIndex 0`. |
| P3-8 | Topic chips show the same focus ring as `Button`. |
| P3-11 | Below `lg`, the live editor and the version viewer fit the page to the width (SuperDoc `zoom.mode: 'fit-width'`); at `lg` and up they stay at 100%. |
| P3-12 | "Refresh topics" is renamed "Regroup topics". |

## Non-goals

- P3-1 (error page headings), P3-2 (app name on sign-in, sign-up subtitle), P3-4 (upload dialog alignment), P3-9 (relative timestamps), P3-10 (rename toast): out of scope by owner decision.
- Avatar background in the SuperDoc user colour (P2-16, marked optional by the audit).
- A confirmation step before "Reset link" (the audit's change list asks only for the wording and the description).
- The share dialog's initial focus (Radix default stays).
- Word counts per bin in the API, which "words everywhere" would need (see decisions).
- Restructuring hooks beyond what a fix needs: lane C2 splits `useTimeTravel`, `TimelinePanel` and the auth forms afterwards.

## Design

### Data flow

No new requests. Every change is presentation inside the existing components, plus three small client-side pieces of state:

- **Summary reveal.** `SelectionSummaryCard` remembers the last revealed key (the summary key, or the running state) and calls `scrollIntoView({ block: 'nearest' })` only when it changes after the first render, so opening a document with a cached summary never scrolls the page.
- **New document focus.** `useCreateDocument` navigates with router state `NEW_DOCUMENT_STATE`; `DocumentPage` reads it and passes `focusOnReady` to `SuperDocEditor`, which calls `superdoc.focus()` from `onReady`.
- **Viewport zoom.** `SuperDocEditor` and `VersionViewer` start SuperDoc with `zoom.mode` from `matchMedia('(width < 64rem)')` and follow changes: narrow calls `setZoomMode('fit-width')`, wide calls `setZoom(100)`.

### Interfaces

- `apps/web/src/lib/app-copy.ts`: `APP_NAME`.
- `apps/web/src/lib/use-document-title.ts`: `pageTitle(title: string | null): string`, `useDocumentTitle(title: string | null): void`.
- `apps/web/src/lib/format-date-time.ts`: `formatBinMoment({ time, binMs })`, `formatBinRange({ start, binMs })` (rewritten on `Intl.DateTimeFormat#formatRange`), `formatVersionMoment(time)`, `TimePrecision`, `precisionOf(binMs)`.
- `features/timeline/timeline-copy.ts`: `EditUnit`, `countLabel({ count, unit })`, `editDeltaLabel({ inserted, deleted, unit })` replacing `wordsDeltaLabel`; `REGROUP_TOPICS_LABEL` replacing `REFRESH_TOPICS_LABEL`.
- `features/timeline/timeline-panel.tsx`: `PanelState` on `aside[data-state]`.
- `features/timeline/topic-swatch.tsx`, `features/timeline/streamgraph-legend.tsx`.
- `features/editor/home-link.tsx`, `features/editor/superdoc-zoom.ts` (`ZoomMode`, `NARROW_VIEWPORT_QUERY`, `initialZoomMode()`, `followViewportZoom(superdoc)`).
- `features/documents/new-document-state.ts`, `features/documents/use-create-document.ts`, `features/documents/document-columns.ts` (`DocumentListKind`, `DocumentColumn`).
- `components/ui/skeleton.tsx`, `components/ui/dropdown-menu.tsx`: shadcn primitives on the existing `radix-ui` package.
- `styles/globals.css`: tokens `--inserted`, `--deleted`, `--online` (light and dark) and the SuperDoc variables `--sd-comment-highlight-internal` / `--sd-comment-highlight-external`.
- `EditorHeader` and `Members` take `currentUserId: string | null`; `SuperDocEditor` takes `focusOnReady: boolean`; `NewDocumentButton` takes `{ isPending, onCreate }`; `DocumentTable` takes `kind: DocumentListKind`.

### Failure handling

- Clipboard rejected or missing (insecure origin): the input is selected and a status says to copy with the keyboard; no unhandled rejection.
- `matchMedia` change while the editor is mounted: the zoom follows; the listener is removed on unmount.
- A Dialog opened from a dropdown item: the menu is `modal={false}` so closing the dialog never leaves `pointer-events: none` on `body`.
- A summary already cached when the panel opens: no scroll.
- A band with exactly one character: "1 character", and the E2E band locator still matches it.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Scope of the UX lane | P1 + P2 (S) + cheap P3 · also the three M items | All P1, all P2, P3 items 3, 6, 7, 8, 12, plus P2-2 (mobile header overflow menu), P2-13 (blank-document backdrop and focus) and P3-11 (fit-to-width below `lg` only if SuperDoc 2.23.0 exposes a zoom option) | 2026-10-17 |
| What is left out | — | P3-1, P3-2, P3-4, P3-9, P3-10; P3-5 folded into P2-2 | 2026-10-17 |
| Lane order and paths | — | Lane B (structure) lands first, so paths follow lane B; lane C2 (web readability) runs after, so no hook restructuring here beyond what a fix needs | 2026-10-17 |
| Does SuperDoc 2.23.0 expose a zoom option (P3-11) | yes → implement · no → document and stop | Yes: `Config.zoom: { initial?, mode?: 'manual' \| 'fit-width', fitWidth?: { min?, max?, padding? } }` and `setZoom`, `setZoomMode`, `getZoomState` (`node_modules/superdoc/dist/superdoc/src/core/types/index.d.ts` `SuperDocZoomConfig`, `SuperDoc.d.ts` `setZoomMode`). Implemented. | 2026-10-17 |
| P2-1 one unit for every number | words everywhere (needs per-bin word counts from the API) · words where the data has words, characters where it only has characters, always labelled | Planner default, owner may override: words in Top edits, characters in the tooltip and band labels; every number labelled, pluralized, zero side hidden | 2026-10-17 |
| P1-4 range format | hand-built string · `Intl.DateTimeFormat#formatRange` | Planner default: `formatRange`; seconds when `binMs` is under a minute; the year only when it is not the current year; the banner always shows seconds | 2026-10-17 |
| P2-2 where Delete goes | overflow menu below `sm` only · overflow menu at every width | Planner default: "More actions" menu at every width, which also settles P3-5; Download and Share keep their text from `sm` up | 2026-10-17 |
| P1-1 back link form | arrow icon only · "Documents" link · arrow and app name | Planner default, from the proposal's "back link + app name": arrow and app name, accessible name "SuperDoc Collab, back to documents" | 2026-10-17 |
| P2-3 role labels and columns | — | Planner default: Owner / Can edit / Can view under the header "Access"; "Mine" shows Title and Updated | 2026-10-17 |
| P3-12 | `title` on the button · rename | Planner default: rename to "Regroup topics" (a disabled button never shows its `title`, see `docs/learnings/2026-10-17-a-disabled-button-never-shows-its-title.md`) | 2026-10-17 |
| P2-14 viewer colour | align the viewer to the panel · the panel to the viewer | Planner default: both use the new `--inserted` green; the viewer through SuperDoc's documented `--sd-comment-highlight-*` variables | 2026-10-17 |
| P2-16 online colour | brand blue · status green | Planner default: a new `--online` green token | 2026-10-17 |
| P2-13 which documents get focus | every editable document · documents created with "New document" | Planner default: only "New document" (router state), so opening an existing document never pops the phone keyboard | 2026-10-17 |
| P2-17 the period rule | — | Planner default: a message with a verb is a sentence and ends with a period; labels, headings and noun-phrase states ("No edits yet", "Read only", "Link copied") do not | 2026-10-17 |

## Test strategy summary

- Vitest with Testing Library for every behaviour change, red commit first, mirroring the existing `*.test.tsx` style. No class-string assertions (lane D removes them): pure styling items (P2-4 column hiding, P2-15 text size, P3-8 focus ring, the P2-13 backdrop) are proven by the test plan's screenshot boxes.
- Existing E2E specs updated where a control moved or a label changed (Delete through the menu, Regroup topics, the band locator).
- The test plan has one box per audit item, each compared against the audit screenshot of the same state at 1280 and 375.
