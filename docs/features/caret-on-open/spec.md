# Caret on open

**Status:** Approved
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner: "ao clicar em new document ou em um documento existente, o cursor tem que aparecer automaticamente tanto pra quem criou o doc tanto pra quem joined later")
**ADRs:** none
**Not changing:** reader (viewing) mode, the toolbar, the Escape exit sentinel

## Problem

A document opens with no caret: the first keystroke goes nowhere until the person clicks the page. Both the creator of a new document and a member who joins later are affected. A programmatic `superdoc.focus()` was tried in 2026-10-17 and removed: SuperDoc 2.23.0 focuses its composition textarea without a document selection and the first keystroke throws "This edit couldn't be completed" (`docs/learnings/2026-10-17-focusing-a-new-superdoc-document-before-the-first-click-crashes-the-first-keystroke.md`).

## Goals

1. When an editor-role document finishes loading (creator or joiner, new or existing), the caret is visible at the start of the document and the first keystroke lands there.
2. No regression of the learning: a keystroke right after the automatic focus never raises `edit-rejected`.
3. Reader role, past-version view and the print frame stay without a caret.

## Design

Spike first, in the lane's scratch (never committed): after `onCollaborationReady` and once the first `.superdoc-page` holds a `.superdoc-fragment`, try in order and keep the first that passes the acceptance test (a `keyboard.type('x')` right after lands in the page text and no `edit-rejected` exception is raised; the overlay caret `[data-v2-local-selection-caret='true']` is visible):

1. `superdoc.focus()` followed by a check of `activeEditor` selection state, in case 2.23.0 behaves differently after collaboration readiness.
2. The runtime's `reveal({ kind: 'position', position })` with a position token minted for the document start, then `focus()`.
3. Synthetic pointer sequence (`pointerdown`, `mousedown`, `mouseup`, `click`, `pointerup`) dispatched at the first fragment's client rect on the page element, which is what a real click does.

The chosen mechanism lives in `apps/web/src/features/editor/use-caret-on-open.ts` and is called from `superdoc-editor.tsx` once per editor instance, only when `role !== Reader`. The spike's table (approach, result, evidence) goes into this spec. The learning gets a `Revisited` line and `.claude/rules/web-ui.md` gets the new fact.

### Failure handling

| Case | Behaviour |
|------|-----------|
| No approach passes the acceptance test | stop; report to the lead with the evidence; ship nothing for this lane |
| The page is not painted within `PRINT_READY_TIMEOUT_MS` | give up silently; the click still works |

## Test strategy summary

Unit: the hook waits for the first fragment, runs once, and never runs for a reader. E2E (`e2e/documents.spec.ts` or a new spec): New document → type without clicking → text appears, no rejected-edit status; Bruno joins an existing document → types without clicking → text appears; a reader has no caret.
