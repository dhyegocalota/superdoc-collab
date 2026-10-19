# Readability in the editor and the timeline panel

**Status:** Shipped 2026-10-19
**Lane:** product
**Tier:** 🟢 small. No new behaviour, no schema change and nothing the user sees.
**Owner approval:** approved 2026-10-19
**ADRs:** none
**Not changing:** request paths, query keys, poll intervals, every user-visible string, every class name and the DOM of the document page and the timeline panel.

## Problem

The sibling lane `readability-web` deferred the files that the member-presence and summarize lanes were editing. Member presence has merged. `DocumentPage` is a 217-line component whose `reload()` repeats the connection reset and the editor remount in both catch paths, and whose two waiting branches render the same screen. `TimelinePanel` is 187 lines and passes a no-op `ignoreTravel` as a handler. `TimelineNotices` asserts `lagMs!` after a null check inside a longer condition.

## Goals

1. `DocumentPage`: fold the two repeated reload tails into one, fold the two waiting branches into one, then split the component into the reload hook, the failure-action hook, the status lines, the editor surface and the version bar. Same DOM.
2. `TimelinePanel`: split into named parts and replace the no-op `ignoreTravel` with an explicit branch or a named handler.
3. `TimelineNotices`: model the absence of `lagMs` explicitly, with no non-null assertion.
4. A sweep of `apps/web/src/features/editor` and the timeline panel files for nested ifs, `else`, loops that read better as array methods, positional multi-parameter functions, unnamed compound conditions, `??` fallbacks and inline copy in JSX. The clear cases are fixed and the rest listed under Known gaps.

## Non-goals

- `features/timeline/selection-summary-card`, `use-summarize`, `use-selection-summary`, `timeline-api` and `timeline-copy`: the summarize lane edits them.
- Behaviour changes of any kind.
- Files the sibling lane `readability-web` touched: the streamgraph, time travel, the print page, `FormMessage` and the testing helpers.

## Design

### Failure handling

Behaviour is preserved by construction. Each item is one commit, pinned by the existing unit files of the code it touches. Rollback is reverting that item's commit.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve the lane | approve, trim, skip | approved | 2026-10-19 |

## Test strategy summary

Unit tests only, one targeted file at a time; the lane ends with `pnpm typecheck`. The E2E suite and the local gate run at the merge. No browser walk, because nothing the user sees changes.

## Known gaps

Deferred on purpose:

- The `retryAfterMs` conversion in `selection-summary-card.tsx` stays until the summarize lane merges, because that lane owns the file.

Left on purpose after the sweep of the editor and the timeline panel files:

- `reduceMachine(machine, action)` in `use-connection-state.ts` keeps two positional parameters because it is a reducer for `useReducer`.
- The `timeline!` and `bins[index]!` assertions in `use-bin-selection.ts`, `bin-containing.ts`, `idle-breaks.ts` and `timeline-tooltip.tsx` index arrays the caller has already bounded. Replacing them is a behaviour decision, not a readability one.
- `DocumentPage` (about 150 lines) and `TimelinePanel` (about 130 lines) are shorter in JSX but still long. `DocumentPage` keeps its hooks above the readiness returns, and moving them into a child would reset state whenever the waiting screen shows. `TimelinePanel` keeps `useElementWidth` so the chart width survives a collapse and reopen.
- The `forEach` calls in `highlight-edits.ts`, `use-member-cursors.ts` and `use-timeline-search.ts` are array methods that run side effects and read clearly.
- Streamgraph, time travel and version files stay with the sibling lane.
