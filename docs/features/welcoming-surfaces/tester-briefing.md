# Tester briefing: Welcoming surfaces

## What changed and where

- `apps/web/src/features/auth/auth-layout.tsx` wraps the card of sign in, sign up and reset password. At `lg` and above the panel is the right column (tagline, illustration, three value lines, About link). Below `lg` it is a compact header above the card: mark, name, About link, tagline. Copy lives in `auth-copy.ts`. `AuthSkeleton` (sign-up loading and the sign-in redirect guard) and `LinkInvalidCard` render inside the same layout; the shared `SessionSkeleton` used by other routes stays bare. `auth-card.tsx` now uses `flex-1` instead of `min-h-screen`; its labels, roles and order are unchanged.
- `apps/web/src/components/app-mark.tsx`: the mark extracted from `brand-link.tsx`, used by the top bar and the auth panel.
- `apps/web/src/components/history-illustration.tsx`: inline SVG, `aria-hidden`, no title, author tokens through `fill-author-N` classes, no hex values, no animation.
- `apps/web/src/features/documents/`: `use-upload-document.ts` (the mutation and the messages, extracted from the dialog), `upload-dialog.tsx` (now uses the hook), `upload-drop-zone.tsx`, `upload-drop-overlay.tsx` (window listeners, enter/leave counter, reset on drop, dragend and `mouseleave` of the document element), `documents-empty-state.tsx`, `documents-page.tsx`, `documents-copy.ts`.
- The create-document error moved from the toolbar section to directly under the page heading so it shows in both states.
- `e2e/editor.ts`: new `openDocumentFileInput`, used by `uploadSeed` and by `uploadBrief` in `e2e/final-visuals.spec.ts`, so a user whose list is empty (no `Upload .docx` button) still reaches the `Document file` input. Approved by the lead.
- `apps/web/README.md`: one sentence.

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/features/auth src/components src/features/documents
pnpm test:e2e e2e/documents.spec.ts e2e/auth.spec.ts
```

Screenshots (git-ignored, `.pr-media/welcoming-surfaces/`): `sign-in-`, `sign-up-`, `documents-empty-` at `1280` and `375`, each `-light.png` and `-dark.png`, plus `documents-drop-overlay-1280-light.png`.

## Red first

| Commit | Red failure text the run printed |
|---|---|
| d2199cce | `Error: AuthLayout is not implemented` (4 tests), `Error: DocumentsEmptyState is not implemented` (3 tests), the illustration tests fail with `HistoryIllustration is not implemented` (7 tests); 14 failed |
| 9240fdc4 | `Error: UploadDropZone is not implemented`, `Error: UploadDropOverlay is not implemented`, `Error: useUploadDocument is not implemented`; page tests: `Unable to find role="heading" and name "Start with a document"`, `expected '/documents' to be '/documents/doc-2'` (drop did nothing), `Unable to find an accessible element with the role "alert"` (two files); 24 failed |

Pins (green when they landed): the dialog tests in `upload-dialog.test.tsx` and the page tests that kept their meaning (toolbar, tables, New document). The page test `the header holds Use with AI...` now uses a non-empty list.

Green: 159 unit tests across auth, components and documents; E2E `documents.spec.ts` and `auth.spec.ts` 25 passed; `pnpm typecheck` green.

## Hypotheses for the tester

1. A user with no documents sees the heading, the illustration, one `New document` button (primary) and the dashed zone; no tables, no `Upload .docx` button.
2. One shared document is enough to bring the tables and the toolbar back.
3. Dragging a file from the desktop shows the overlay; dragging selected text does not.
4. Moving the pointer over child elements while dragging never flickers the overlay; leaving the window, `Escape` or a drop hides it.
5. Dropping one `.docx` uploads and opens it, in both empty and non-empty states; two files show `Drop one file at a time.`; a pdf shows the docx-only message; a file over 10 MB shows the limit.
6. The auth card keeps its labels, roles and order; sign in, claim, invite sign-up and reset password still work.
7. At 375 no page scrolls sideways; at 1280 the panel is the right half.
8. Dark mode follows the theme tokens on all new surfaces.

## Gaps I know about

- The sign-up "instance could not be reached" error text is still bare (no layout).
- The dialog no longer closes before navigation but after the list refresh and just before it; the visible result is the same.
- Safari drag events and a real desktop drag are not exercised; the E2E dispatches synthetic events.
- The `frontend-design` skill could not be loaded in this lane (no Skill tool); the visual direction stays inside the existing tokens.
- Commit trailers name Claude Sonnet 5.5, the model that wrote them.

## Tester run 2026-10-19

- Walked sign-in and sign-up at 1280 and 375 in both themes, the invite flow end to end, the empty page, the one-document page, drag messages and a real CDP drag and drop. Hypotheses 1, 2, 3, 5, 7, 8 held.
- Defect to confirm (medium): the drop overlay stays up after a cancelled drag and nothing dismisses it. Claim 1 (card roles diff) not done.
- Console: one resource error on a reload during the drag tests.
