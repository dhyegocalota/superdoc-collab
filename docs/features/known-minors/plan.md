# Known minors Implementation Plan

> **For agentic workers:** executed natively in one session (five bounded fixes, one lane), tests committed first.

**Goal:** close the five known minors from the slice 3 and 4 hand-overs.

**Architecture:** no new modules beyond a `KeyboardKey` enum and a `postMessage` kind; each fix touches the file that owns the behaviour.

**Tech Stack:** React 19, TanStack Query, Hono, Vitest, Playwright.

**Spec:** `docs/features/known-minors/spec.md`

## Global Constraints

- No comments, no `else`, no `?? default`, enums over literals, constants at the top of the file or in `libs/types`.
- Tests first in their own commit; every red test fails on its named assertion.

## Review Focus

1. Escape with a SuperDoc dropdown open must not steal focus: the handler acts only when the event target is the editing surface (SuperDoc's `textarea`, or a `contenteditable`).
2. Escape in the title input (always non-empty) must keep the version: covered by the "field being typed in" rule.
3. A foreign-origin `Exit` message must be ignored: `readViewerMessage` already checks origin and source.
4. The stamp must still move on topic recomputes with the same cursor: unchanged topics part of the stamp.
5. Two sent names where one is a part of the other ("Ana" and "Silva, Ana"): both kept only when every part of each is returned.

---

### Task 1: red tests

- [x] Add the unit tests and E2E specs named in the spec, plus inert stubs (`ViewerMessageKind.Exit`, `ProjectionStatus.cursor`, copy constants, `authorsNamed` with the old behaviour).
- [x] Run them: ten unit tests red on their named assertions.
- [x] Commit `test(web,server): pin the five known minors before fixing them`.

### Task 2: implementation

- [x] `apps/web/src/lib/keyboard.ts`, `use-time-travel.ts` (`isTypingInField`), `filter-box.tsx` (Escape clears the draft).
- [x] `timeline-notices.tsx` drops the bands condition.
- [x] `prompts.ts` `authorsNamed` matches every comma part; `selection-summaries-service.ts` uses it.
- [x] `timeline-service.ts` returns `cursor`; `selection-summary.ts` stamps with it.
- [x] `version-view-page.tsx` posts `Exit` on Escape; `version-frame.tsx` forwards to `onExit`; `document-page.tsx` wires Back to live.
- [x] `superdoc-editor.tsx` hint, sentinel and Escape handler.
- [x] `pnpm typecheck`, unit suites green, the three E2E specs green locally.
- [x] Commit `fix(web,server): close the five known minors`.

### Task 3: docs, review, PR

- [x] Feature folder, learning, roadmap row, tester briefing.
- [x] Reviewer sub-agent on the branch diff: WITH RESERVATIONS, two IMPORTANT (a filled filter box lost the version on the first Escape in a real browser because React commits the cleared draft before the document listener runs; an unsplit comma name was dropped) and five MINOR; all seven fixed in one round with tests.
- [x] PR, CI green, merge.
