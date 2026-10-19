# Test plan: Showcase document

## The failing test first

- [ ] `showcase-paragraphs.test.ts::four authors across five days with gaps over five minutes` — expected: the invariants hold
- [x] Confirmed it fails for the right reason: `Error: buildShowcaseParagraphs is not implemented` (8 of 8 failed)

## Unit

- [x] `showcase-documents.test.ts`: row, file and import scheduled; storage failure removes the row
- [x] `admin-routes.test.ts`: admin creates the showcase (201); a user gets the guard's answer
- [x] `sign-up-gate.test.ts`: the first claim creates one showcase; a later sign-up creates none

## E2E

- [ ] `e2e/showcase.spec.ts::the first sign-in finds the guided tour with a full timeline` — fresh stack; expected: the document in the list; timeline shows four contributors and at least one gap marker

## Prove it for real — Playwright MCP

- [ ] Admin → Create the showcase document → open it: streamgraph with several days, gap markers, topics named (fake model) and contributors' colours
- [ ] 375 px: the panel at the bottom still shows the chart

## Adversarial review

- [ ] Claim 1: no date in the future — attack: create at a fixed clock and read the last event time; result:
- [ ] Claim 2: every gap over five minutes is marked — attack: count gap markers against the burst table; result:
- [ ] Claim 3: the claim path never fails sign-up — attack: make storage throw in the test; result:

## Coverage honesty

- Real-model topic names are not asserted; the fake model's names are.
