# Readability in the libraries

**Status:** Built, awaiting review
**Lane:** product
**Tier:** 🟢 small. No new behaviour, no schema change and nothing the user sees.
**Owner approval:** approved 2026-10-18
**ADRs:** none
**Not changing:** the public API of `libs/history` and `libs/types` (except dead exports removed), `libs/types/src/constants.ts`, HTTP routes, SQLite schemas and every user-visible string.

## Problem

The readability survey (top-ten items 2 and 10, plus the libs part of its lane split) found small readability defects in the shared libraries and seven repeated blank-string compares across the apps.

## Goals

1. `libs/history/src/timeline/runs.ts`: the binary search loses its `else`; its non-null assertions stay (see Known gaps).
2. `isBlank` in `libs/types/src/text.ts`, with a unit test, replaces the blank-string compares where the text is already trimmed or trimmed on the spot: `topics-service.ts`, `document-title.tsx`, `print-page.tsx` and `author-palette.ts`.
3. Dead exports in the libraries are un-exported or removed after a grep across the repository, tests included.
4. A sweep of both libraries for the code conventions; the clear cases are fixed and the rest are listed under Known gaps.

## Non-goals

- Everything in the survey's server and web lanes, and every deferred item.
- `libs/types/src/constants.ts`, which another lane edits.
- Three blank compares on raw, untrimmed text: `filter-box.tsx` (Escape clears a draft that is only spaces), `keyboard.ts` (a text field holding only spaces still counts as filled) and `format-date-time.ts` (the offset slice is never trimmed). Trimming them would change behaviour.
- Sharing `transitionsOf` between the two zoned-time tests. Verification showed they are not duplicates: one scans a year every fifteen minutes, the other scans seventy years every fourteen days and bisects each hit to the second. A shared helper would change what each test proves.

## Design

### Interfaces

| Name | File | Signature |
|------|------|-----------|
| `isBlank` | `libs/types/src/text.ts` | `isBlank(text: string): boolean`, true when the text is empty after trimming |

Seventeen names used only inside their own files stop being exported: `runMatchesTerm`, `isAgentAuthorKey`, `TOPIC_HUE_START`, `TOPIC_HUE_END`, `TimeZonePartsError`, `PROJECTION_BATCH_SIZE`, `MissingBootstrapUpdateError`, `DUPLICATE_TOPIC_NAMES_MESSAGE`, `extractStructClientIds`, `AGENT_NAME_SUFFIX`, `PASSWORD_MIN_LENGTH`, `NAME_MIN_LENGTH`, `TIME_ZONE_MAX_LENGTH`, `AGENT_KEY_SUFFIX`, `HASH_OFFSET_BASIS`, `HASH_PRIME` and `SOCKET_MESSAGE_UPLOAD_MULTIPLE`.

### Failure handling

Behaviour is preserved by construction. Each item is one commit, pinned by the existing unit files of the code it touches. `isBlank` gets its own unit test, written first. Rollback is reverting that item's commit.

## Open questions → answers

| Question | Options | Owner's answer | Date |
|----------|---------|----------------|------|
| Approve the lane | approve, trim, skip | approved | 2026-10-18 |

## Test strategy summary

Vitest only. Every item runs the unit files it touches; the lane ends with `pnpm typecheck`. No Playwright walk, because nothing the user sees changes.

## Known gaps

The sweep found `libs/history/src` and `libs/types/src` already close to the conventions: no `??` fallback, no `else` left, no nested `if`, no function over 40 lines, and no positional multi-parameter function except sort comparators. What remains, left on purpose:

- `binStartContaining` keeps two non-null assertions. With `noUncheckedIndexedAccess` the indexed read is `number | undefined`, and the search never leaves the array, so a throwing branch would be dead code.
- `edit-events.ts` and `agent-actions.ts` keep presence compounds (`!beforeState && afterState`, `row.first === null || row.last === null`) unnamed, because a named alias would stop TypeScript narrowing the values the next line reads.
- `binStartContaining` and `occupiedBinStarts` keep their `while` loops. Both stop on a computed condition, and an array method would need the bin count in advance.
- About twenty exported types and the three read-model tables have no importer outside their file. They are left because un-exporting a type that appears in an exported signature hurts readers of the declaration.
- `ReadModel.commit` is 41 lines, one over the guideline, and is one transaction body.
