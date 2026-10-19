# Test plan: Showcase document

## The failing test first

- [ ] `showcase-paragraphs.test.ts::four authors across five days with gaps over five minutes` — expected: the invariants hold — BLOCKED: unit tests are the lead's gate
- [x] Confirmed it fails for the right reason: `Error: buildShowcaseParagraphs is not implemented` (8 of 8 failed)

## Unit

- [x] `showcase-documents.test.ts`: row, file and import scheduled; storage failure removes the row
- [x] `admin-routes.test.ts`: admin creates the showcase (201); a user gets the guard's answer
- [x] `sign-up-gate.test.ts`: the first claim creates one showcase; a later sign-up creates none

## E2E

- [ ] `e2e/showcase.spec.ts::the first sign-in finds the guided tour with a full timeline` — fresh stack; expected: the document in the list; timeline shows four contributors and at least one gap marker — BLOCKED: the E2E suites are the lead's gate

## Prove it for real — Playwright MCP

- [x] Admin → Create the showcase document → open it: streamgraph with several days, gap markers, topics named (fake model) and contributors' colours — evidence: Admin, Create the showcase document: POST /api/admin/showcase 201; the list shows "SuperDoc Collab: a guided tour" (Mine); opened: timeline Oct 14 8:00 AM to Oct 18 6:00 PM UTC (five days, last event on the previous UTC day, today is Oct 19), 106 bins, bands General (2491 characters) and SuperDoc Collab (16 characters) named by the fake model, 15 dashed vertical break markers between busy hours with the long idle stretches flattened, four authors in the API (Ana Lima, Bruno Costa, Caio Souza, Dani Alves) and all four seen in the edit rows while stepping the bins; the live page lists the imported changes as tracked suggestions with an IMPORTED sidebar; screenshots .pr-media/testing/showcase-document-timeline-1280.png, showcase-document-bin-1280.png
- [x] 375 px: the panel at the bottom still shows the chart — evidence: 375: panel at the bottom, chart 313 px wide inside the viewport, scrollWidth 375; screenshot .pr-media/testing/showcase-document-timeline-375.png

## Adversarial review

- [x] Claim 1: no date in the future — attack: create at a fixed clock and read the last event time; result: — evidence: last bin Oct 18 6:00 PM against a creation on Oct 19 12:25 UTC (a real clock, not a fixed one)
- [ ] Claim 2: every gap over five minutes is marked — attack: count gap markers against the burst table; result: — BLOCKED: no burst table is exposed in the UI; 15 break markers counted, not compared to the table
- [ ] Claim 3: the claim path never fails sign-up — attack: make storage throw in the test; result: — BLOCKED: needs an unclaimed stack and a throwing storage; unit level only

## Coverage honesty

- Real-model topic names are not asserted; the fake model's names are.

## Edge cases found during execution

- A second press of the Admin button made a second document: two "SuperDoc Collab: a guided tour" rows in the list (hypothesis 4)
- Summarize edits on the showcase (once): the summary "Dani Alves and Caio Souza and Ana Lima and Bruno Costa edited 49 passages." showed, no error toast, no 4xx or 5xx responses (the summaries unchanged check passes); the sentence repeats "and" between four names
- Top edits shows only three contributor avatars for the General band (Dani Alves, Ana Lima, Caio Souza) with no overflow marker, so the fourth contributor (Bruno Costa) is not visible in that row: MAX_AVATARS is 3 in contributor-avatars.tsx; existing behaviour, but it hides the showcase's fourth author on first look. Minor.
- The Filter box with @Bruno did not narrow the top edits panel at the moment checked (no bin selected); left unexplored
- The list was reached by navigation, not by an in-place refresh, so hypothesis "appears in the list without a reload" is not proven
