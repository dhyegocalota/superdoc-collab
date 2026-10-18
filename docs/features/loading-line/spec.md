# The loading line above the toolbar is for screen readers only

**Status:** Approved
**Lane:** product
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 (the owner asked for it directly: the visible "Loading document…" line above the toolbar is unnecessary)
**ADRs:** none
**Not changing:** the copy, the `role="status"`, the `LOADING_DOCUMENT_REASON_ID` wrapper that the Download button and the header reference through `aria-describedby`, the file-error message (still visible), the superseded case, SuperDoc's own loading overlay.

## Problem

While the document opens, the editor page shows a small "Loading document…" line above the toolbar, and SuperDoc's overlay already shows the loading progress on the paper. Sighted users see the same news twice.

## Change

In `apps/web/src/features/editor/document-page.tsx` the status paragraph rendered while `superdoc === null` becomes visually hidden (`sr-only`). Assistive technology still hears it and the Download button is still described by it. Unit test in `document-page.test.tsx`: while loading the status is in the document with the `sr-only` class and the Download button is described by it; the existing superseded test keeps asserting the line is gone.
