# Readability in the web app

**Status:** Building
**Lane:** product
**Tier:** 🟢 small. No new behaviour, no schema change and nothing the user sees.
**Owner approval:** approved 2026-10-19
**ADRs:** none
**Not changing:** request paths, query keys, poll intervals, every user-visible string, every class name and the DOM the streamgraph renders.

## Problem

The readability survey left work in `apps/web/src` after the first web pass (`refinement-readability-web`): one `??` fallback, helpers copied across tests, a 301-line `Streamgraph`, a 109-line `useTimeTravel`, and convention slips in the versions and documents features. Two other lanes (member presence and summarize) are in flight on neighbouring files, so this lane works only outside them.

## Goals

1. `FormMessage` in `components/ui/form.tsx` branches on the error instead of `error?.message ?? ''`.
2. `stubMatchMedia` (two copies) and the print-frame helpers `printFrame` and `sendFromFrame` (two copies) live once in `apps/web/src/testing`.
3. `Streamgraph` is split into named parts by concern, with the same DOM and classes.
4. `useTimeTravel` is split into a hook plus pure helpers or two hooks, with the same return shape.
5. A sweep of the versions and documents features for the code conventions; the clear cases are fixed and the rest listed under Known gaps.
6. Dead exports in `apps/web/src` are un-exported after a repository-wide grep that includes tests.

## Non-goals

- Everything in the server and libraries lanes.
- The excluded files listed under Known gaps.
- Behaviour changes of any kind.

## Design

### Failure handling

Behaviour is preserved by construction. Each item is one commit, pinned by the existing unit files of the code it touches, with a new test first where behaviour could drift. Rollback is reverting that item's commit.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve the lane | approve, trim, skip | approved | 2026-10-19 |

## Test strategy summary

Unit tests only, one targeted file at a time; the lane ends with `pnpm typecheck`. The E2E suite and `pnpm verify` run at the gate. No browser walk, because nothing the user sees changes.

## Known gaps

Deferred to a follow-up lane after member-presence and summarize-wow merge, because those lanes own the files:

- `DocumentPage` reload fold and split (`features/editor/document-page.tsx`).
- `TimelinePanel` split and the `ignoreTravel` no-op (`features/timeline/timeline-panel.tsx`).
- `lagMs!` in `features/timeline/timeline-notices.tsx`.
- The `retryAfterMs` conversion in `features/timeline/selection-summary-card.tsx`.
- Auth pages, `main.tsx`, `testing/render-with-providers.tsx`, and the editor members and cursor files.

Left on purpose after the sweep of the versions and documents features:

- `VersionFrame` repeats `!isRequestedReady || requestedSequence === null` in two effects. A named alias would stop TypeScript narrowing `requestedSequence` for the call on the next line.
- `PrintView` and `VersionFrame` dispatch viewer messages with a short run of one-line `if`s. A record keyed by kind needs a payload type per kind and would not read shorter.
- `DocumentsPage` is 42 lines, 36 of them JSX, two over the guideline, and has no logic to split out.
- About fifteen exported types and the auth and timeline-copy exports have no importer outside their file. The auth and `timeline-copy` ones sit in excluded files; the types stay because an unexported type in an exported signature hurts readers of the declaration.
- `sendFromFrame` in `time-travel.test.tsx` shares a name with the print-frame helper but sends viewer messages with another shape, so it stays.
