# Refinement: web readability (lane C2)

**Status:** Approved
**Tier:** 🟡 medium. Nothing the user sees changes, and nothing crosses the wire differently. It still splits `useTimeTravel` and `TimelinePanel`, rewires every poller and every query key builder, and replaces both auth pages, so every control-flow change is pinned by a test before it moves.
**Owner approval:** approved 2026-10-17 (refinement proposal)
**ADRs:** none new.
**Not changing:** request paths and methods, query key values, poll intervals, `Retry-After` header parsing, every user-visible string, layout and Tailwind classes, the SuperDoc options passed to the constructor, `apps/server`, `poc/`, and E2E specs.

## Problem

A first-time reader of `apps/web` meets a 100-line `useTimeTravel` that owns URL state, version pinning, version polling, the debounced scrub, the Escape key and frame failures, with a nested `if` in its pin effect. `TimelinePanel` mixes bin selection, summary state, topic refresh and layout around a resize handle defined in the same file. Nineteen `if (!response.ok) throw` lines write the same status message by hand, ten query key builders repeat the same prefix, three poll predicates repeat the same 404 check, two hooks repeat the same "reset after Retry-After" effect in two units (milliseconds for topics, seconds for summaries). The two auth pages are about 90% identical. The same `<p role="alert" className="text-sm text-destructive">` repeats in eleven files. Names such as `canRefresh` (it also gates Summarize), `shown` (a `VersionSummary`) and the auth `RETRY_AFTER_HEADER = 'X-Retry-After'` (same name as the shared `Retry-After` constant) send the reader the wrong way.

Source: `scratchpad/audit-readability.md`, web items, and `scratchpad/refinement-proposal.md` lane C2.

## Goals

The approved scope, each item re-checked on 2026-10-17 against the worktree `superdoc-take-home-wt-ux-care` (lane B merged) and against the code lane A (`refinement-ux-care/plan.md`) and lane C1 (`refinement-readability-server/plan.md`) will leave:

- **Top 10:** items 3 (`useTimeTravel`), 5 (web API layer), 9 (`TimelinePanel`) and 10 (auth pages).
- **Names (section 1):** 1.6, 1.14, 1.15, 1.16, 1.17, 1.19 and 1.20.
- **Long functions (section 2):** 2.2, 2.3 (resize handle and bin selection), 2.11, 2.12 and 2.13.
- **Conditionals (section 3):** 3.1, 3.4, 3.5, 3.12, 3.13, 3.14 and 3.15.
- **Duplication (section 4):** the web call sites of 4.17, 4.18 and 4.19 (plus the web copy of 4.8's `/^\d+$/`), 4.20 to 4.26, 4.28 to 4.31, and the `jsonResponse` half of 4.33.
- **Over-engineering (section 5):** 5.7 and 5.8.

## Non-goals

- Server and `libs/history` items: lane C1.
- `useSelectionSummaryState` (the third extraction 2.3 suggests): the approved lane names only the resize handle and the bin selection. After lane A the summary state is four lines that feed one card and one button.
- New behaviour, new copy, new styling, new dependencies.

## Items dropped after verification

| Item | Why it is dropped |
|------|-------------------|
| 4.27 one date formatter | Lane B already replaced the three `Intl.DateTimeFormat` copies with `lib/format-date-time.ts`; it is the only file that builds a formatter today. |
| 4.32 `useOpenCreatedDocument` | Lane A Task 6 moves the create flow into `useCreateDocument`, and Task 7 makes it navigate with `NEW_DOCUMENT_STATE`. The upload flow closes its dialog between the two calls and carries no state, so what is left in common is two lines with different options. |
| 5.5 inline `HALF = 2` | It conflicts with the repo rule "constants over magic literals" (`CLAUDE.md`). `HALF` stays. |
| 4.33 one configurable `mockDocumentApi` | The two route tables serve different needs: `time-travel.test.tsx` has version reply queues, a timeline gate and a "gone" switch; `document-page.test.tsx` keeps rename state. They are also the proof suites for the `useTimeTravel` split, which must stay unchanged. The server `temporaryDirectory` half belongs to the server side. `jsonResponse` stays in scope. |

## Items corrected after verification

| Item | Audit said | Code says | Plan does |
|------|------------|-----------|-----------|
| 4.22 | `documentFileQueryKey` uses a literal outside the hierarchy, move it in | Every rename and delete invalidates `['documents']`. Under that prefix the active file query (a DOCX blob) would be refetched on each rename. | Keep the file key outside the documents hierarchy on purpose; only its literal becomes the named constant `DOCUMENT_FILE_QUERY_KEY`. A test pins that `['documents']` does not match it. |
| 1.19 | Drop the `activeSuperdoc` and `document` aliases, use shorthand | The aliases exist because TypeScript does not carry a narrowing into hoisted function declarations (checked with the repo's `tsc`: TS18047, TS18048). | Move the effect body into `highlightUntilCancelled({ superdoc, editorDocument, runs })`, whose parameters are already non-null. No alias, no shadowed `document`, shorthand-free `{ document: editorDocument }`. |
| 4.17 | Seven copies of `inserted + deleted`, three of them on the web | The web copies are on `TimelineCell` (two) and `TimelineContributor` (one, a sort). `runVolume` measures strings and does not apply. | `cellVolume` for the two cells, `byVolumeDescending` for the sort, keeping the web's author-key tie break. |
| 4.19 | One shared `presentOrNull` | Lane C1 exports `presentOrNull(value: string \| undefined)`. `URLSearchParams.get` returns `string \| null`. | Widen the shared parameter to `string \| null \| undefined` and delete the web copy. |
| 4.23 | `pollWhileAvailable(intervalMs)` replaces three predicates | There are six pollers: timeline, summaries, two bin-edits queries, members, and the running selection summary. | All six read `pollWhileAvailable(interval)`; `pollWhileRunning` composes it. |
| 4.20 | 19 `!response.ok` lines | 20 with `use-session.ts` and `fetchVersion`. `openDocument` and `fetchDocumentFile` throw copy, not a status message, and `fetchVersion` maps a failure to `VersionLoadKind.Failed`. | 16 adopt `readJson` or `assertOk`; those three keep their own lines. Every message stays byte-identical. |
| 3.13 | Handler record keyed by kind in `version-frame.tsx` | After `useWindowMessage`, the three checks sit under one `if (message === null) return;`. | Flat checks after the null guard, plus a named `registerFrame(sequence)` ref callback. A record adds a type for three lines. |

## Base

The branch is cut from `main` after lane A (both UX groups, G1 timeline and G2 screens, merged) and lane C1. Tasks 2 and 9 need lane C1's exports: `libs/types/src/text.ts` (`presentOrNull`), `NON_NEGATIVE_INTEGER_PATTERN` and `secondsRoundedUp` from `@superdoc-collab/types`, and `cellVolume` and `byVolumeDescending` from `@superdoc-collab/history/timeline`. Without C1 merged those two tasks cannot start.

## Design

All paths are as they will be after lanes B, D, A and C1.

### Data flow

Nothing changes for a request or a render. These internal seams move:

- **Time travel:** `useTimeTravel` reads the URL (`useTimelineSearch`), finds the bin with `binContaining`, pins its sequence with `pinnedSequenceAt`, loads the version with `useVersionLoad`, reads the bin runs with `useBinRuns`, and listens for Escape with `useEscapeKey`. The pin effect becomes four flat guards: live, already pinned, bin without a version, no bin.
- **Timeline panel:** `TimelinePanel` gets `selectedIndex`, `selectedBin`, `selectIndex` and `clearSelection` from `useBinSelection`, which uses the same `binContaining`. `ResizeHandle` lives in `resize-handle.tsx`.
- **API layer:** every API function answers in the same order: `assertDocumentAvailable` (404 → `DocumentUnavailableError`), the route-specific statuses, then `readJson` or `assertOk`, which throw `ApiRequestError(requestFailedMessage({ subject, status }))`. Every query key under a document is `documentQueryKey({ documentId, segments })`. Every poller is `pollWhileAvailable(interval)`. Both "too soon" errors extend `RetryLaterError` with `retryAfterMs`, and `useResetAfterRetry` resets their mutation.
- **Listeners:** `useWindowMessage(handler)` and `useEscapeKey({ isEnabled, onEscape })` own the `window` message and `document` keydown subscriptions. Both keep the latest handler in a ref, so callers need no ref of their own. `useEscapeKey` listens on `document` in the bubble phase and ignores an Escape whose default was prevented, so a band's `stopPropagation` still keeps the document listener from firing twice.

### Interfaces

New shared code:

| Name | File | Signature |
|------|------|-----------|
| `DocumentUnavailableError`, `requestFailedMessage` | `apps/web/src/lib/api.ts` | moved from `editor-api.ts` and `timeline-copy.ts` |
| `assertDocumentAvailable`, `assertOk`, `readJson` | `apps/web/src/lib/api.ts` | `assertDocumentAvailable(response: Response): void`; `assertOk({ response, subject }): void`; `readJson<Body>({ response, subject }): Promise<Body>` |
| `pollWhileAvailable` | `apps/web/src/lib/api.ts` | `pollWhileAvailable(intervalMs: number): (query: PolledQuery) => number \| false` |
| `RetryLaterError` | `apps/web/src/lib/api.ts` | `new RetryLaterError({ message, retryAfterMs })`, `readonly retryAfterMs: number` |
| `useResetAfterRetry` | `apps/web/src/lib/use-reset-after-retry.ts` | `useResetAfterRetry({ error, reset }: { error: Error \| null; reset: () => void }): void` |
| `useWindowMessage` | `apps/web/src/lib/use-window-message.ts` | `useWindowMessage(handler: (event: MessageEvent) => void): void` |
| `useEscapeKey` | `apps/web/src/lib/use-escape-key.ts` | `useEscapeKey({ isEnabled, onEscape }: { isEnabled: boolean; onEscape: (event: KeyboardEvent) => void }): void` |
| `isTypingInField` | `apps/web/src/lib/keyboard.ts` | moved from `use-time-travel.ts` |
| `KeyboardKey.ArrowLeft`, `.ArrowRight`, `.Home`, `.End` | `apps/web/src/lib/keyboard.ts` | added members |
| `PRIMARY_BUTTON_PRESSED` | `apps/web/src/lib/pointer.ts` | moved from two components |
| `ErrorMessage` | `apps/web/src/components/error-message.tsx` | `ErrorMessage({ children, className }: { children: ReactNode; className?: string })` |
| `documentQueryKey`, `DOCUMENT_FILE_QUERY_KEY` | `apps/web/src/features/documents/documents-api.ts` | `documentQueryKey({ documentId, segments }: { documentId: string; segments: unknown[] }): unknown[]` |
| `fetchDocuments` | `apps/web/src/features/documents/documents-api.ts` | moved from `use-documents.ts` |
| `binContaining` | `apps/web/src/features/timeline/bin-containing.ts` | `binContaining({ timeline, time }): IndexedBin \| null`, `IndexedBin = { index: number; bin: TimelineBin }` |
| `useBinSelection` | `apps/web/src/features/timeline/use-bin-selection.ts` | `useBinSelection({ timeline, at, onTravel, onBackToLive }): BinSelection` |
| `useBinRuns` | `apps/web/src/features/timeline/use-bin-runs.ts` | moved from `use-time-travel.ts` |
| `useVersionLoad` | `apps/web/src/features/timeline/use-version-load.ts` | `useVersionLoad({ documentId, sequence }): { version: VersionLoad \| undefined; isError: boolean }` |
| `maxBandVolume` | `apps/web/src/features/timeline/max-band-volume.ts` | `maxBandVolume(timeline: DocumentTimeline): number` |
| `authorNames` | `apps/web/src/features/timeline/author-of.ts` | `authorNames({ authors, authorKeys }): string` |
| `ResizeHandle` | `apps/web/src/features/timeline/resize-handle.tsx` | moved from `timeline-panel.tsx` |
| `superdocOptions`, `DocumentMode` | `apps/web/src/features/editor/superdoc-options.ts` | `superdocOptions({ container, documentId, file, documentMode, collaborationPath, roomMode, user }): Config`; `DocumentMode` moved from `superdoc-editor.tsx` so the two files do not import each other |
| `useDocumentFile`, `useMembers`, `UnavailableNotice`, `OpeningDocument` | `apps/web/src/features/editor/{use-document-file,use-members,unavailable-notice,opening-document}.ts(x)` | moved from `document-page.tsx` |
| `AuthCard`, `AuthTextField`, `AuthFieldType` | `apps/web/src/features/auth/{auth-card,auth-text-field}.tsx` | see plan Task 15 |
| `jsonResponse` | `apps/web/src/testing/json-response.ts` | `jsonResponse({ body, status, headers }): Response` |
| `presentOrNull` | `libs/types/src/text.ts` | parameter widened to `string \| null \| undefined` |

Renames:

| From | To | Where |
|------|----|-------|
| `RETRY_AFTER_HEADER` (auth) | `AUTH_RETRY_AFTER_HEADER` | `auth-failure.ts`, `use-auth-submit.ts` |
| `canRefresh`, `refresh` (panel locals) | `canEdit`, `refreshTopics` | `timeline-panel.tsx` |
| `isOpen && canRefresh` (three times) | `showsEditorActions` | `timeline-panel.tsx` |
| `freshOpened`, `setup` | `openedAfterMount`, `editorSetup` | `document-page.tsx` |
| `TimeTravel.shown`, `pinned` | `shownVersion`, `pinnedVersion` | `use-time-travel.ts`, `version-banner.tsx`, `document-page.tsx` |
| `existing` | `existingIndex` | `version-frame.tsx` |
| `SummaryTooSoonError.retryAfterSeconds` | `retryAfterMs` (through `RetryLaterError`) | `timeline-api.ts`, `selection-summary-card.tsx`, `use-selection-summary.ts` |
| `interface`s and `TValues` in `useAuthSubmit` | `type` aliases and `Values` | `use-auth-submit.ts` |
| `UPLOAD_FAILED_MESSAGE`, `CREATE_FAILED_MESSAGE` | `UPLOAD_SUBJECT`, `CREATE_SUBJECT` | `documents-copy.ts` (messages stay identical) |

### Failure handling

Behaviour is preserved by construction, and these tests pin it:

- **Existing suites stay green unchanged.** `time-travel.test.tsx`, `timeline-panel.test.tsx`, `version-view-page.test.tsx`, `document-page.test.tsx` and `sign-in-page.test.tsx` are the proof for the splits. The only edits allowed in existing test files are:
  - import paths in the mechanical commit (Task 1);
  - the `@/lib/api` mock factories in `redirect-if-session.test.tsx` and `sign-out-flow.test.tsx`, which return only `{ apiGet }` and become the partial form `router.test.tsx` uses, because `fetchMe` now calls `readJson` (Task 6);
  - the `retryAfterSeconds` → `retryAfterMs` assertions in `timeline-api.test.ts` (Task 9);
  - the `DocumentMode` import path in `document-page.test.tsx` and `version-view-page.test.tsx`, after it moves to `superdoc-options.ts` (Task 13);
  - `onDownload={null}` → `onDownload={undefined}` in `editor-header.test.tsx` (Task 16);
  - the `jsonResponse` sweep (Task 17), which runs last.
- **New shared helpers get their own unit test, committed red first** with an inert stub, so the red run fails on the named assertion: `readJson`, `assertOk`, `assertDocumentAvailable`, `documentQueryKey`, `pollWhileAvailable`, `useResetAfterRetry`, `useWindowMessage`, `useEscapeKey`, `binContaining`, `useBinSelection`, `superdocOptions`, `ErrorMessage`, `AuthCard`, `AuthTextField`, `maxBandVolume` and `authorNames`.
- **Moves without a covering test get a pinning test first, committed green on its own:** the sign-in 429 message, the streamgraph arrows without a selection, the streamgraph label positions, the query key values and the invalidation scope, the sign-up page, and the upload message order.
- **`Retry-After` units:** the server header stays in seconds. The web keeps milliseconds everywhere internally and converts to seconds once, for display, with `secondsRoundedUp`. `MIN_RETRY_AFTER_MS` is one second, so every timer fires at the same moment as today for integer headers. A fractional header (the server never sends one) would now reset at its exact millisecond rather than the next whole second.
- **Rollback:** every task is a test commit plus one implementation commit, or one mechanical commit. Reverting them restores the previous state. No data is migrated.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve lane C2 | approve, trim, skip | approved (refinement proposal) | 2026-10-17 |
| Where `requestFailedMessage` lives | `timeline-copy.ts`, `lib/api.ts` | `lib/api.ts`, with `readJson` (audit 4.20, approved list) | 2026-10-17 |
| The `onDownload` absent value | `null` with a ternary at the call, `undefined` | `undefined`: `onClick` accepts it, so the ternary goes away (planner default, owner can override) | 2026-10-17 |

## Test strategy summary

Vitest for every helper and every split, with the existing suites as the proof. Every task ends with `pnpm format:check`, `pnpm typecheck` and `cd apps/web && npx vitest run` green, then a commit. The lane ends with `pnpm test:unit` and `pnpm test:e2e` green. A short Playwright MCP walk at 1280 and 375 confirms nothing visible moved, because the auth pages, the timeline panel and the editor page were rebuilt from new parts.
