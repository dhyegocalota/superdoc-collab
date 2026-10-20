# Test plan: Local preview

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/local-preview/use-local-preview.test.tsx::shows the kept file while the document is waiting` — input: a kept file for `doc-1`, readiness Waiting; expected: the hook returns that file — evidence: red commit d79250a9, failure `expected null to be File{}`
- [x] `apps/server/src/collaboration/room-bootstrap.test.ts::a device job is claimed by its owner` — input: `registerDevice` then `claimDevice` as the owner; expected: an attempt string and `isCurrent` true — evidence: red commit 8a0f7278, failure `Error: claimDevice is not implemented`
- [x] Confirmed each fails for the right reason: the stub throws `<name> is not implemented`, recorded in the tester briefing — evidence: tester-briefing.md, Red today table; second-socket case red in 79096b5a

## Unit

- [x] `local-file-store.test.ts` — keep then take returns the file; discard removes it; a second document does not see it — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `use-local-preview.test.tsx` — Ready drops the file; Failed drops the file; no kept file returns null — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `device-guard.test.ts` — viewport narrow: refused with the viewport reason; `deviceMemory` 2: refused with the memory reason; `deviceMemory` absent and wide: allowed; `deviceMemory` 4: allowed — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `preview-open-view.test.ts` — zero pages: no pages part; 123 pages: "123 so far"; the server detail follows; the device owner name appears for joiners — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `local-preview.test.tsx` — mounts a viewing-mode SuperDoc with the kept file, shows the badge, hides the panel after the first paragraph — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `use-opened-document.test.tsx` — a Create answer is Ready; a Join answer Preparing is Waiting — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `use-upload-document.test.tsx` — success keeps the file under the new id before navigating; 413 with `canPrepareOnDevice` exposes the offer; accepting it re-sends with `preparation=device`; a 413 without it exposes no offer — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `room-bootstrap.test.ts` — a second claim from another tab is refused while the first has a live socket; a failed or expired job is not claimable; a non-owner claim returns null; a claim after Ready returns null; `deviceClosed` with the current attempt fails the job; with a stale attempt does nothing; `ready` clears the attempt of a device job; `received` raises `done` for the claimed attempt — evidence: unit runs at 902bbcb6, server 551 passed (collaboration, documents, http), web 611 passed (local-preview, documents, editor, open-progress), types 80 passed
- [x] `collaboration-runtime.test.ts` — the owner of an uncommitted device job gets Create; another member gets Join; after the commit everyone gets Join — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `collaboration-server.test.ts` — a claimed member socket writes and commits; after the commit its next update is logged; a stale claimed socket is closed and its update is dropped — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] `documents-routes.test.ts` — guard refusal answers 413 with `canPrepareOnDevice: true`; the same upload with `preparation=device` answers 201 and registers a device job without queuing a bootstrap; a small file with `preparation=device` is prepared by the server — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] Edge: `preparation=device` with a value outside the enum — expected: 400, nothing stored — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)
- [x] Edge: a reader or editor opening a device document — expected: Join, never Create — evidence: lane/testing5 353d7dd8, web local-preview/documents/editor/open-progress 600 passed (58 files), server collaboration+documents 482 passed (34 files)

## E2E (Playwright specs)

- [x] `e2e/local-preview.spec.ts::the uploader sees a preview before the shared copy is ready, and the panel keeps counting` — steps: upload through the file input, scripted Preparing answers; expected: the first paragraph is visible inside the preview badge page while the answer is Preparing, and the panel's elapsed text changes at least twice while the heavy preview converts — evidence: developer run, 7 of 7 green on ports 3120/3129; spec cases `the uploader reads the document in a preview…` and `the preview of a large document opens while the panel keeps counting…` (9 distinct panel lines)
- [x] `e2e/local-preview.spec.ts::the page swaps to the live room without a reload` — steps: record `performance.timeOrigin` and a window marker, wait for Ready; expected: the badge is gone, the editor is editable, the marker and `timeOrigin` are unchanged — evidence: developer run, spec case `the page swaps to the live room without a reload` green
- [x] `e2e/local-preview.spec.ts::a file the memory guard refuses is prepared on the owner's device` — steps: restartable stack with a small memory limit, upload a document above it, press "Prepare on this device"; expected: 413 message first, then the document opens in Create, a second person sees "Being prepared on ana's device" and then the paragraph after the commit — evidence: developer run, spec cases under `a server with no memory to prepare a file` and `a four gigabyte server and the heavy fixture` green; the joiner saw the owner's device named

## E2E rerun

- [x] `e2e/local-preview.spec.ts` 7 of 7 — evidence: 353d7dd8 on a scratch stack at 3400/3499, 2.9m

## Prove it for real — Playwright MCP

- [x] Happy path: upload the brief; expected: preview within about 3 s, badge, then the live editor with the same paragraphs — evidence: scripted walk (MCP typing is rejected) at 353d7dd8: first text 849 ms and 1,572 ms after the upload at 1280, badge "Preview · the shared copy is being prepared", swap to the live editor 4.7 s after the upload with the same page (window marker and timeOrigin kept), typing works; at 375 swap at 2.7 s; .pr-media/instant-open-2/walk-preview/brief-first-text-1280.png, brief-live-1280.png, brief-first-text-375.png. Scroll could not be tested: the brief fits one screen
- [ ] FAILED (partly): Heavy fixture on the 8 GB local server: expected: preview in about the old 42 s, counter ticking, tab responsive (scroll and click answer) — first text 10.0 s and 14.5 s after the upload (target well under 42 s met), tab answers (probe 0 ms, longest event loop stall 0.77 and 1.1 s), the panel is hidden once the preview shows; the swap FAILED two ways: at about 57 s the preview disappears and a "Receiving 34.9 MB" panel with no text stays for 17 s until the live editor shows at 73.6 s, and the scroll of the preview (wheel 1500) resets to 0 after the swap; typing works after the swap. Steps: upload heavy-document.docx, wheel-scroll the preview, wait. .pr-media/instant-open-2/walk-preview/heavy-first-text-1280.png, heavy-live-1280.png, joiner-ana-receiving-gap-1280.png, e1-heavy.out
- [x] Heavy fixture on a scripted 4 GB limit (superseded by the heap-shaped stacks: 4 GB now refuses without a button, 6 GB opens from the device, see the E2E cases): expected: the 413 message with the button, then the document opens from the device — evidence: MEMORY_LIMIT_MEGABYTES=4096: 413 dialog "This server can prepare documents with up to 4 MB of text and layout." with the button; after the click the document opened in the owner device, text at +53 s; .pr-media/instant-open-2/walk-preview/hybrid-dialog-1280.png, h1.out
- [x] Rejected input: a narrow viewport (375 px) on the refused upload; expected: no button, the viewport reason — evidence: 375 px: same sentence plus "This screen is too narrow to prepare a large document. Open the app on a laptop or desktop and upload it there.", zero Prepare buttons; .pr-media/instant-open-2/walk-preview/guard-375-refused.png
- [x] Browser Back mid-preview; expected: the documents list, the kept file dropped, the server preparation unaffected — evidence: Back at +4 s of the preview went to /documents; reopening showed no badge and no kept file; the shared copy became ready 50 s later and the live document has no edit events; .pr-media/instant-open-2/walk-preview/preview-back-1280.png, g1.out
- [x] Reload mid-preview; expected: the waiting page, no preview — evidence: reload at +15 s showed the waiting page ("Converting 9.5 MB of text and layout · about 45 s · 14 s elapsed"), no badge; .pr-media/instant-open-2/walk-preview/preview-reload-1280.png
- [x] Two authors: owner prepares on the device, a second person joins; expected: the second sees the owner's device named, then the document — evidence: bruno joined 7 s in and read "Being prepared on Ana's device · about N", then "Loading document…", and had text at +55 s, two seconds after ana (hybrid-bruno-device-1280.png, hybrid-bruno-text-1280.png). With the server preparing, a joiner read the server counter and had text 83 s after joining, 87 s after the upload, while ana had had text at 11.6 s (joiner-bruno-waiting-375.png, j1.out)
- [x] Console and network clean, other than the expected 413 — evidence: only the expected 413 on the refused upload and 503/400 on forged requests; no other console errors in the walks
- [ ] FAILED (partly): Desktop width and narrow width screenshots at `.pr-media/local-preview/`; video at the same path — screenshots at 1280 and 375 under .pr-media/instant-open-2/walk-preview/ (not under .pr-media/local-preview/); no video recorded in this walk

## Edge cases found during execution

- With the guard scripted, the owner closes the tab 20 s into the device preparation: the joiner sees the failure card "The document could not be prepared. The file may be damaged or not a valid .docx. Upload it again or try another file." within 1 s (hybrid-kill-bruno-final-1280.png); the server logs "Bootstrapping the room failed ... The device preparing the room closed before the commit."; the owner reopening gets the editor with "Loading document…" and no counter, and has text 91 s later (a new conversion). The card blames the file, not the closed tab.
- A small file posted with preparation=device on a 4 GB server is 201 and prepared by the server (stage ready, join, preparedOnDeviceOf null); preparation=nonsense is 400 "The preparation source is not valid.".
- Typing, a paste event and a file drop into the preview changed nothing: the text is absent from the preview and from the live document, and the shared copy has no edit events (preview-typing-attempt-1280.png).
- A second tab of the owner opened while the first preview converts shows the server panel ("1 document ahead"), no badge.
- Device-prepared rooms: the server log has only small resident figures (145 to 266 MB, 324 to 430 MB) in its release lines (server-4gb-stack.log). The stale-tab double seeding of a device room was not exercised.
- The guard at 375 refuses before any memory check; the memory half of the guard was not exercised.

## Adversarial review

- [x] Claim 1: the preview never edits the shared copy — attack: type into it, paste, drop a file; result: held, nothing reached the preview text, the live copy or the log of edits (g1.out)
- [ ] Claim 2: the device claim cannot seed a committed room — attack: a stale tab reconnects after the commit; result: NOT ATTACKED, no stale device tab was staged
- [x] Claim 3: the tab stays responsive while the heavy preview converts — attack: scroll and type in the address bar during the conversion; result: held, probe latency 0 ms and a longest stall of 0.77 to 1.1 s on a loaded machine

## Coverage honesty

- The measured times are for one laptop; the claim is "about", not a budget.
- `navigator.deviceMemory` is Chromium only; other browsers skip that half of the guard by design.
