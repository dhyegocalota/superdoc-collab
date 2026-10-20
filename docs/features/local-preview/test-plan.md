# Test plan: Local preview

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/local-preview/use-local-preview.test.tsx::shows the kept file while the document is waiting` — input: a kept file for `doc-1`, readiness Waiting; expected: the hook returns that file — evidence: red commit d79250a9, failure `expected null to be File{}`
- [x] `apps/server/src/collaboration/room-bootstrap.test.ts::a device job is claimed by its owner` — input: `registerDevice` then `claimDevice` as the owner; expected: an attempt string and `isCurrent` true — evidence: red commit 8a0f7278, failure `Error: claimDevice is not implemented`
- [x] Confirmed each fails for the right reason: the stub throws `<name> is not implemented`, recorded in the tester briefing — evidence: tester-briefing.md, Red today table; second-socket case red in 79096b5a

## Unit

- [ ] `local-file-store.test.ts` — keep then take returns the file; discard removes it; a second document does not see it
- [ ] `use-local-preview.test.tsx` — Ready drops the file; Failed drops the file; no kept file returns null
- [ ] `device-guard.test.ts` — viewport narrow: refused with the viewport reason; `deviceMemory` 2: refused with the memory reason; `deviceMemory` absent and wide: allowed; `deviceMemory` 4: allowed
- [ ] `preview-open-view.test.ts` — zero pages: no pages part; 123 pages: "123 so far"; the server detail follows; the device owner name appears for joiners
- [ ] `local-preview.test.tsx` — mounts a viewing-mode SuperDoc with the kept file, shows the badge, hides the panel after the first paragraph
- [ ] `use-opened-document.test.tsx` — a Create answer is Ready; a Join answer Preparing is Waiting
- [ ] `use-upload-document.test.tsx` — success keeps the file under the new id before navigating; 413 with `canPrepareOnDevice` exposes the offer; accepting it re-sends with `preparation=device`; a 413 without it exposes no offer
- [ ] `room-bootstrap.test.ts` — a second claim from another tab is refused while the first has a live socket; a failed or expired job is not claimable; a non-owner claim returns null; a claim after Ready returns null; `deviceClosed` with the current attempt fails the job; with a stale attempt does nothing; `ready` clears the attempt of a device job; `received` raises `done` for the claimed attempt
- [ ] `collaboration-runtime.test.ts` — the owner of an uncommitted device job gets Create; another member gets Join; after the commit everyone gets Join
- [ ] `collaboration-server.test.ts` — a claimed member socket writes and commits; after the commit its next update is logged; a stale claimed socket is closed and its update is dropped
- [ ] `documents-routes.test.ts` — guard refusal answers 413 with `canPrepareOnDevice: true`; the same upload with `preparation=device` answers 201 and registers a device job without queuing a bootstrap; a small file with `preparation=device` is prepared by the server
- [ ] Edge: `preparation=device` with a value outside the enum — expected: 400, nothing stored
- [ ] Edge: a reader or editor opening a device document — expected: Join, never Create

## E2E (Playwright specs)

- [x] `e2e/local-preview.spec.ts::the uploader sees a preview before the shared copy is ready, and the panel keeps counting` — steps: upload through the file input, scripted Preparing answers; expected: the first paragraph is visible inside the preview badge page while the answer is Preparing, and the panel's elapsed text changes at least twice while the heavy preview converts — evidence: developer run, 7 of 7 green on ports 3120/3129; spec cases `the uploader reads the document in a preview…` and `the preview of a large document opens while the panel keeps counting…` (9 distinct panel lines)
- [x] `e2e/local-preview.spec.ts::the page swaps to the live room without a reload` — steps: record `performance.timeOrigin` and a window marker, wait for Ready; expected: the badge is gone, the editor is editable, the marker and `timeOrigin` are unchanged — evidence: developer run, spec case `the page swaps to the live room without a reload` green
- [x] `e2e/local-preview.spec.ts::a file the memory guard refuses is prepared on the owner's device` — steps: restartable stack with a small memory limit, upload a document above it, press "Prepare on this device"; expected: 413 message first, then the document opens in Create, a second person sees "Being prepared on ana's device" and then the paragraph after the commit — evidence: developer run, spec cases under `a server with no memory to prepare a file` and `a four gigabyte server and the heavy fixture` green; the joiner saw the owner's device named

## Prove it for real — Playwright MCP

- [ ] Happy path: upload the brief; expected: preview within about 3 s, badge, then the live editor with the same paragraphs
- [ ] Heavy fixture on the 8 GB local server: expected: preview in about the old 42 s, counter ticking, tab responsive (scroll and click answer)
- [ ] Heavy fixture on a scripted 4 GB limit: expected: the 413 message with the button, then the document opens from the device
- [ ] Rejected input: a narrow viewport (375 px) on the refused upload; expected: no button, the viewport reason
- [ ] Browser Back mid-preview; expected: the documents list, the kept file dropped, the server preparation unaffected
- [ ] Reload mid-preview; expected: the waiting page, no preview
- [ ] Two authors: owner prepares on the device, a second person joins; expected: the second sees the owner's device named, then the document
- [ ] Console and network clean, other than the expected 413
- [ ] Desktop width and narrow width screenshots at `.pr-media/local-preview/`; video at the same path

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the preview never edits the shared copy — attack: type into it, paste, drop a file; result:
- [ ] Claim 2: the device claim cannot seed a committed room — attack: a stale tab reconnects after the commit; result:
- [ ] Claim 3: the tab stays responsive while the heavy preview converts — attack: scroll and type in the address bar during the conversion; result:

## Coverage honesty

- The measured times are for one laptop; the claim is "about", not a budget.
- `navigator.deviceMemory` is Chromium only; other browsers skip that half of the guard by design.
