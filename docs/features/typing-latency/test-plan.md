# Test plan: Typing latency

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::the live editor virtualizes pages to a window of one so a keystroke in a large document lays out a few pages` — input: the options of an editing session; expected: `layoutEngineOptions` equals the virtualization window and overscan the spec names
- [ ] Confirmed it fails for the right reason: `expected undefined to deeply equal { virtualization: { enabled: true, window: 1, overscan: 0 } }`, so the option is missing and the test is not broken

## Unit

- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::the options open the file in its room as the signed-in user, fitted to the width` — input: viewing options; expected: the whole options object, now including `layoutEngineOptions`
- [ ] `apps/web/src/features/editor/superdoc-options.test.ts::the preview options open the uploaded bytes read-only` — input: preview options; expected: no `layoutEngineOptions`, so the preview keeps SuperDoc's default

## E2E (Playwright specs)

- [ ] `e2e/typing-latency.spec.ts::a keystroke in a 2,000-page document reaches the page in under 1.5 s at the start and under 500 ms in the middle, with no task over 1 s` — steps: upload the 9.5 MB fixture, join as a second author, type ten letters with the caret at the start, scroll to the middle, click a clause, press Home, type ten more; expected: the start median under 1.5 s, the middle median under 500 ms and the longest task under 1 s (the measured reality with margin, a guard against getting worse)
- [ ] `e2e/device-first.spec.ts`, `e2e/local-preview.spec.ts`, `e2e/backpressure.spec.ts`, `e2e/room-admission.spec.ts` serially with the new spec — expected: green, with the device-first times (uploader editable about 70 s, joiner about 77 s, first text about 10 s) holding

## Prove it for real — Playwright MCP

- [ ] Happy path: open the 9.5 MB document, type at the start, scroll to the middle and the end; expected: pages paint without a blank frame, the typed text shows at once
- [ ] Single: a one-paragraph document; expected: identical to the default but for the title
- [ ] Many: the brief; expected: identical to the default but for the title
- [ ] Two authors in two browser contexts at once: one types at the start, the other watches; expected: the presence cursor and the authorship text show as before
- [ ] Version viewer: open the latest version of the brief; expected: the same page as the default
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Desktop width: 1280; expected: layout as before
- [ ] Narrow width: 375; expected: layout as before
- [ ] Screenshots at `.pr-media/typing-latency/look/`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the look is identical to the default — attack: scroll the large document quickly to the end and screenshot at once; result:
- [ ] Claim 2: the E2E bound holds on a loaded machine — attack: run it beside another suite; result:
- [ ] Claim 3: find and print keep working — attack: search for a word on page 2,000 and print a short document; result:

## Coverage honesty

What is not tested and why.

- The 2% of the keystroke cost that sits in our code (three React commits, about 100 mutation callbacks) — not attributable to one source in a profile, so it stays.
- Machines slower than this one — the bounds carry margin, not a guarantee.
