# Welcoming surfaces: sign-in and the first documents page

**Status:** Shipped 2026-10-19
**Tier:** 🟡
**Owner approval:** approved 2026-10-19 (owner's request, translated: "make the sign-in page beautiful with images, and the home page with a beautiful empty state and an attractive upload")
**ADRs:** none
**Not changing:** the auth flows and their copy, the upload API and its limits, the documents table and its columns, the account menu

## Problem

Sign in is a bare card on a blank background; the first documents page is two empty tables with a heading. Neither says what the product is or invites the first action.

## Design (recommended; the owner can override the visual choices)

### Sign in, sign up, reset password

- One `AuthLayout` (`apps/web/src/features/auth/auth-layout.tsx`) wraps the three auth pages. At `lg` and above: two columns, the existing card on the left (unchanged behaviour and copy), a decorative panel on the right on a muted gradient of the existing tokens (`bg-muted` to `bg-background`), holding the app mark, the app name, one tagline (`AUTH_TAGLINE`) and three value lines (`AUTH_VALUE_LINES`: history over time, who changed what, summaries of edits). Below `lg` the panel collapses to a compact header above the card: mark, name, tagline.
- The imagery is an inline SVG React component, `HistoryIllustration` (`apps/web/src/components/history-illustration.tsx`): a document page with text lines whose runs carry the four `--author-N` colours, beside a small streamgraph of the same four colours. It uses `currentColor` and the CSS tokens so it follows dark mode; it is `aria-hidden` with no `<title>`; no raster images, no stock photos. `prefers-reduced-motion` disables any transition.
- The page carries the About link (`AppRoute.About`) in the panel footer.

### Documents page

- Empty state (both lists empty): instead of two empty tables, one `DocumentsEmptyState` (`apps/web/src/features/documents/documents-empty-state.tsx`): the illustration, `EMPTY_STATE_HEADING` ("Start with a document"), `EMPTY_STATE_DESCRIPTION` (one sentence about what the timeline will show), a primary `New document` button and a dashed drop zone (`UploadDropZone`, `apps/web/src/features/documents/upload-drop-zone.tsx`) that says `DROP_ZONE_LABEL` ("Drop a .docx here, or choose a file") with the size limit from `MAX_UPLOAD_MEGABYTES`, a `Choose a file` button bound to the hidden file input (label `FILE_INPUT_LABEL`, unchanged, so the E2E helpers keep working), and the upload state inline: `UPLOADING_MESSAGE` with a progress bar (`role="progressbar"`, indeterminate), then the existing error messages (not a DOCX, too large, generic) under the zone.
- Page-level drop: whenever a file is dragged over the documents page, a full-page overlay (`UploadDropOverlay`) appears with the dashed frame and `DROP_OVERLAY_LABEL` ("Drop to upload"); dropping a file starts the same upload; dropping more than one file or a non-DOCX shows the existing messages. The overlay never shows for drags that carry no files (`event.dataTransfer.types` includes `Files`).
- Non-empty state: the tables stay as they are; the `Upload .docx` button and dialog stay for the toolbar; the page-level drop still works.
- Loading state unchanged (`DocumentListSkeleton`).

### Failure handling

| Case | Behaviour |
|------|-----------|
| Drop of two files | `ONE_FILE_AT_A_TIME_MESSAGE`, nothing uploaded |
| Drop of a non-DOCX | existing `NOT_A_DOCX_MESSAGE` |
| Upload fails | existing error message under the zone, the zone stays usable |
| `dragleave` to a child element | the overlay stays (count enters and leaves) |

## Test strategy summary

Unit: `AuthLayout` renders the panel at `lg` (class presence) and the compact header; `DocumentsEmptyState` shows only when both lists are empty; `UploadDropZone` and `UploadDropOverlay` handle enter/leave counting, a `Files` drag, a two-file drop and a non-DOCX drop; the file input keeps its label. E2E (`e2e/documents.spec.ts` additions): the empty state shows for a fresh user and disappears after New document; a drop of the brief through `page.dispatchEvent('drop')` with a DataTransfer uploads and opens the document. Screenshots at 1280 and 375 for sign in, sign up and the empty documents page, light and dark, recorded for the PR.
