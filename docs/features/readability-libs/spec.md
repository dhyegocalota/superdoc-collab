# Readability in the libraries

**Status:** Building
**Lane:** product
**Tier:** 🟢 small. No new behaviour, no schema change and nothing the user sees.
**Owner approval:** approved 2026-10-18
**ADRs:** none
**Not changing:** the public API of `libs/history` and `libs/types` (except dead exports removed), `libs/types/src/constants.ts`, HTTP routes, SQLite schemas and every user-visible string.

## Problem

The readability survey (top-ten items 2 and 10, plus the libs part of its lane split) found small readability defects in the shared libraries and seven repeated blank-string compares across the apps.

## Goals

1. `libs/history/src/timeline/runs.ts`: the binary search loses its `else` and its non-null assertion.
2. `isBlank` in `libs/types/src/text.ts`, with a unit test, replaces the blank-string compares where the text is already trimmed or trimmed on the spot: `topics-service.ts`, `document-title.tsx`, `print-page.tsx`, `author-palette.ts` and `format-date-time.ts`.
3. Dead exports in the libraries are un-exported or removed after a grep across the repository, tests included.
4. A sweep of both libraries for the code conventions; the clear cases are fixed and the rest are listed under Known gaps.

## Non-goals

- Everything in the survey's server and web lanes, and every deferred item.
- `libs/types/src/constants.ts`, which another lane edits.
- Two blank compares that must not trim: `filter-box.tsx` (Escape clears a draft that is only spaces) and `keyboard.ts` (a text field holding only spaces still counts as filled). Trimming them would change behaviour.
- Sharing `transitionsOf` between the two zoned-time tests. Verification showed they are not duplicates: one scans a year every fifteen minutes, the other scans seventy years every fourteen days and bisects each hit to the second. A shared helper would change what each test proves.

## Design

### Interfaces

| Name | File | Signature |
|------|------|-----------|
| `isBlank` | `libs/types/src/text.ts` | `isBlank(text: string): boolean`, true when the text is empty after trimming |

`runMatchesTerm` (runs.ts) and `PASSWORD_MIN_LENGTH` (auth.ts) are only used inside their own files, so they stop being exported.

### Failure handling

Behaviour is preserved by construction. Each item is one commit, pinned by the existing unit files of the code it touches. `isBlank` gets its own unit test, written first. Rollback is reverting that item's commit.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve the lane | approve, trim, skip | approved | 2026-10-18 |

## Test strategy summary

Vitest only. Every item runs the unit files it touches; the lane ends with `pnpm typecheck`. No Playwright walk, because nothing the user sees changes.

## Known gaps

Filled in by the sweep (plan step 5).
