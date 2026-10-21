# Plan: Typing latency

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `superdocOptions` in `apps/web/src/features/editor/superdoc-options.ts`, the one place the live editor's SuperDoc configuration is built.
**Assumptions (decided, owner can override):**
- Virtualization applies to every document, because the look is identical to the default on a one-paragraph document, the brief and the 2,185-page document.
- The smallest window that keeps the median under 150 ms and scrolls without blank pages is the one shipped.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/editor/superdoc-options.ts`, `apps/web/src/features/editor/superdoc-options.test.ts` | `dev-typing-latency` |
| G2 | `e2e/typing-latency.ts`, `e2e/typing-latency.spec.ts`, `e2e/restartable-stack.ts` | `dev-typing-latency` |
| G3 | `docs/features/typing-latency/`, `docs/features/README.md`, `.claude/rules/web-ui.md` | `dev-typing-latency` |

## Sequencing

G1, then G2, then G3.

## Steps

### G1

- [ ] **Step 1:** the live editor's options carry `layoutEngineOptions.virtualization` with the measured window and overscan; red test first.
- [ ] **Step 2:** look compared with the default on the large document, the brief and a one-paragraph document, at the start, middle and end, with a second author's presence cursor, the authorship text and the version viewer.
- [ ] **Step 3:** window 1 against window 2 with overscan 0 and 1 measured; the smallest setting under 150 ms median that scrolls without blank pages is kept.

### G2

- [ ] **Step 4:** the probe locates the caret's paragraph by the typed text at the start of its line, so it works in the middle of the document.
- [ ] **Step 5:** `e2e/typing-latency.spec.ts` types ten letters at the start and ten in the middle of the large document and bounds the median and the longest task.

### G3

- [ ] **Step 6:** spec with the measured table; README row; the `web-ui` rule line.

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1 | A page scrolled into view stays blank until the window catches up | The scrolled screenshots show an empty page frame | Raise the window or the overscan by one |
| 1 | A feature that reads the whole layout (find, print) sees only the pages in the window | The find count or the printed page count falls short | The print view already sets `virtualization.enabled: false`; the same override fits any such view |
| 5 | The bound is flaky on a loaded machine | The median crosses the bound while another suite runs | The suite runs on its own port and serial, with the achieved number plus margin as the bound |

**Steps with no backout:** none.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded (only if UI was touched).
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
