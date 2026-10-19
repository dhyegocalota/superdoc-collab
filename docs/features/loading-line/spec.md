# The loading line above the toolbar is for screen readers only

**Status:** Shipped 2026-10-18
**Lane:** product
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 (the owner asked for it directly: the visible "Loading document…" line above the toolbar is unnecessary)
**ADRs:** none
**Not changing:** the copy, the `role="status"`, the `LOADING_DOCUMENT_REASON_ID` wrapper that the Download button (`download-menu.tsx`) and the More actions download items (`editor-header.tsx`) reference through `aria-describedby`, the file-error message (still visible), the superseded case, SuperDoc's own loading overlay.

## Problem

While the document opens, the editor page shows a small "Loading document…" line above the toolbar, and SuperDoc's overlay already shows the loading progress on the paper. Sighted users see the same news twice.

## Change

In `apps/web/src/features/editor/document-page.tsx` the status paragraph rendered while `superdoc === null` becomes visually hidden (`sr-only`). Assistive technology still hears it and the Download button is still described by it. No unit test pins the class (testing.md:27 forbids pinning Tailwind classes); the existing tests in `document-page.test.tsx` pin the `role="status"` line and the Download button's and the More actions items' descriptions, and the tester's before and after screenshots at 1280 and 375 under `.pr-media/loading-line/` are the visual proof; the existing superseded test still pins that the line is hidden on a superseded page.

## Rule exception

`.claude/rules/web-ui.md` asks a disabled control to carry a visible reason. While the document loads, SuperDoc's loading overlay on the paper is the visible reason, so the Download description may be screen-reader only. The file-error message stays visible.
