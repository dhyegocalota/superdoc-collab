# Known minors — spec

- Status: Shipped 2026-10-17
- Tier: green (user-visible polish inside existing flows; no schema, no new endpoint, no new dependency).
- Owner approval: approved 2026-10-17 (the owner asked for the known minors from the slice 3 and 4 hand-over to be fixed: "merge tudo e já fix essas pendências menores conhecidas").
- ADRs: [0003](../../adr/0003-time-travel-with-native-yjs-snapshots.md) (version viewer in a same-origin frame), [0012](../../adr/0012-selection-summaries-cached-per-filter-and-cursor.md) (summary freshness = the document cursor).
- Not changing: filters, the summary cache key, the topics pipeline, the editor's own key bindings.

## Problem

The slice 3 and 4 hand-overs listed five small gaps that survived their reviews:

1. Tab stays inside the live editor (ProseMirror consumes it), with no way out for keyboard users.
2. Escape inside the version frame or inside the filter box does not leave the version, because the frame's key events never reach the parent document and every text field was excluded.
3. "Naming topics…" is not shown when topic bands already exist, so a recompute after new blocks is silent.
4. An edit outside the current filter marks the summary as "for an earlier state" only at the next read: the panel re-reads on a stamp built from the filtered volume, which such an edit does not change.
5. A contributor whose name contains ", " can be dropped from a summary's authors when the model splits the name at the comma.

## Goals

- Escape inside the editing surface moves focus to a sentinel after the editor so the next Tab leaves it; a visually hidden hint before the editor says so.
- Escape inside the version frame leaves the version (same as Back to live). Escape in a text field that holds text clears nothing but the filter draft; Escape in an empty field leaves the version.
- Pending topics are announced whenever the topic set is being computed, bands or not.
- The panel's timeline stamp follows the document cursor the server built the timeline from, so any edit anywhere in the document re-reads the summary.
- A sent name is kept when the model returns every comma-separated part of it.

## Decisions

| Question | Options | Decision | Date |
|---|---|---|---|
| Where does focus go on Escape in the editor | the timeline toggle · the page header · a sentinel after the editor | a sentinel after the editor: the next Tab lands wherever the layout puts the next control, and the editor does not need to know the panel | 2026-10-17 |
| How does the frame tell the parent | a shared key handler · a `postMessage` kind | a new `ViewerMessageKind.Exit` on the existing same-origin channel; the parent calls Back to live | 2026-10-17 |
| What the stamp carries | the filtered volume · the document cursor | the cursor, exposed as `projection.cursor` on the timeline; the volume stays out | 2026-10-17 |
| Matching split names | substring of the joined list · every part present | every comma-separated part present in the model's list, in the order of the sent names | 2026-10-17 |

## Interfaces

- `ProjectionStatus` gains `cursor: number | null` (the read model cursor at build time).
- `ViewerMessageKind.Exit`; `VersionFrame` takes `onExit`.
- `authorsNamed({ returned, names })` in `apps/server/src/insights/prompts.ts`.
- `KeyboardKey` enum in `apps/web/src/lib/keyboard.ts`.
- Copy: `EDITOR_ESCAPE_HINT`, `EDITOR_EXIT_LABEL`.

## Tests

Unit: `prompts.test.ts`, `selection-summaries-service.test.ts`, `timeline-routes.test.ts`, `selection-summary.test.ts`, `timeline-panel.test.tsx`, `filter-box.test.tsx`, `time-travel.test.tsx`, `version-view-page.test.tsx`, `document-page.test.tsx`. E2E: Escape in the frame, Escape in the live editor then Tab, an edit outside the filter staling the summary.

## Known gaps after this change

- SuperDoc v2's editing surface is a `textarea`, not a ProseMirror `contenteditable`; the Escape handler accepts both so a future SuperDoc can switch.

- Shift+Tab from the sentinel re-enters the editor; leaving backwards needs Escape then Shift+Tab twice.
- The model may still write a split name inside the free-text sentence; only the `authors` list is matched.
