# Test plan: Welcoming surfaces

## The failing test first

- [ ] `documents-empty-state.test.tsx::shows the empty state when both lists are empty` — expected: the heading and the drop zone
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] `auth-layout.test.tsx`: panel with tagline and value lines; About link; the card's content rendered
- [ ] `history-illustration.test.tsx`: `aria-hidden`, no title, author token classes
- [ ] `upload-drop-zone.test.tsx`: file input keeps `Document file`; uploading state; error under the zone
- [ ] `upload-drop-overlay.test.tsx`: shows on a `Files` drag only; survives dragleave to a child; two files → message; non-DOCX → message

## E2E

- [ ] `e2e/documents.spec.ts::a fresh user sees the empty state and it disappears after New document` — BLOCKED: the E2E suites are the lead's gate; the same state was walked with Eva, see the Prove it box
- [ ] `e2e/documents.spec.ts::dropping the brief on the page uploads it` — BLOCKED: the E2E suites are the lead's gate; the same drop was walked through CDP drag events, see the Prove it box
- [ ] `e2e/auth.spec.ts` and `e2e/admin.spec.ts` (invite sign-up) stay green — BLOCKED: the E2E suites are the lead's gate

## Prove it for real — Playwright MCP

- [x] Sign in at 1280 and 375, light and dark: screenshots — evidence: sign-in at 1280 light and dark and 375 light and dark: panel on the left with tagline and three value lines at 1280, collapsed header with tagline at 375, card with Email, Password, Sign in; screenshots .pr-media/testing/welcoming-surfaces-sign-in-light-1280.png, welcoming-surfaces-sign-in-dark-1280.png, welcoming-surfaces-sign-in-light-375.png, welcoming-surfaces-sign-in-dark-375.png; invite sign-up page ("You were invited") at 1280 and 375, scrollWidth 375: welcoming-surfaces-sign-up-1280.png, welcoming-surfaces-sign-up-375.png
- [x] Empty documents page at 1280 and 375: screenshots; drag a file over the page → overlay; drop → document opens — evidence: fresh invited user Eva (sign-up via an Admin invite link, landed on /documents): heading Documents, illustration (2 aria-hidden svgs), "Start with a document", one New document button, dashed zone with "Drop a .docx here, or choose a file", Up to 10 MB, Choose a file; 0 tables, no Upload .docx button; screenshots .pr-media/testing/welcoming-surfaces-empty-documents-light-1280.png, ...-dark-1280.png, ...-light-375.png, ...-dark-375.png (scrollWidth 360 at 375); real drag through Chrome's drag protocol (CDP Input.dispatchDragEvent with the brief file): overlay "Drop to upload" on enter, drop opened the document "superdoc-eng-sample-project" at /documents/<id> with the overlay gone; screenshot ...-drag-overlay-real-1280.png; drag-and-drop is not driveable with the MCP click tools, the CDP route was scripted through run_code
- [x] Console and network clean — evidence: Eva's console showed one error, the 415 Unsupported Media Type of POST /api/documents for the pdf drop (the docx-only message), expected; sign-up landed on /documents and the brief upload by drop returned a document; network log not captured otherwise

## Adversarial review

- [ ] Claim 1: the auth card behaviour is unchanged — attack: diff the card's rendered roles before and after; result:
- [ ] Claim 2: the overlay never sticks — attack: drag in, press Escape, move out; result: — FAILED: with real drag events from CDP, dragEnter then dragCancel left the overlay "Drop to upload" up, and neither Escape, a click nor mouse movement removed it until a reload (screenshot .pr-media/testing/welcoming-surfaces-overlay-stuck-after-cancel-1280.png). The events show dragenter MAIN, dragenter DIV, and no dragleave on cancel; the component counts enter and leave, listens to window dragend and documentElement mouseleave only, and has no Escape handler although the briefing says Escape hides it. CDP's dragCancel may not emit the dragleave that a real browser emits on Escape, so a real-browser repro is still needed; a stuck full-screen overlay (fixed inset-0 z-50) blocks the whole page, so a safety net (Escape or any pointer event clears it) is worth adding
- [x] Claim 3: no raster image was added — attack: list apps/web/src for png/jpg; result: — evidence: find apps/web/src for png, jpg, jpeg, gif, webp: no files

## Coverage honesty

- Safari drag events are not exercised.

## Edge cases found during execution

- With one document Eva's list returns the table, the Upload .docx button and the New document button and the drop zone is gone (hypothesis 2); screenshot .pr-media/testing/welcoming-surfaces-documents-with-one-1280.png
- Synthetic drag of selected text (no Files type) never shows the overlay; two files dropped show "Drop one file at a time."; a pdf shows "Only .docx files can be uploaded."
- Overlay stuck after a cancelled drag: see Claim 2, new defect to confirm in a real browser; request a regression test that a dragleave with an empty dataTransfer or an Escape key clears the overlay
