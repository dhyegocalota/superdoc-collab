---
name: core-realtime
title: Core realtime — collaboration and history
authors: 2
paths:
  - "apps/server/src/auth/**"
  - "apps/server/src/collaboration/**"
  - "apps/server/src/documents/**"
  - "apps/server/src/history/**"
  - "apps/server/src/http/**"
  - "apps/server/src/insights/**"
  - "apps/web/src/features/documents/**"
  - "apps/web/src/features/editor/**"
  - "apps/web/src/features/sharing/**"
  - "apps/web/src/features/timeline/**"
  - "apps/web/src/features/versions/**"
  - "libs/history/**"
  - "libs/types/**"
---

# Core realtime — collaboration and history

Two authors, Ana and Bruno, work on one document at the same time while the history, the timeline and the versions follow them. Every test states what each author sees; the run passes only when every `Expect` holds without a retry of the step.

## Setup

- Stack: `pnpm scenario:stack` (prints `ORIGIN`), fake model, fresh database, demo users seeded with password `superdoc-demo`.
- Author A = Ana (`ana@example.com`) on the `playwright` server; Author B = Bruno (`bruno@example.com`) on the `playwright-second` server. Both sign in through the form at `/sign-in`.
- Ana clicks **New document** and lands on the editor; she waits for the editor surface, clicks the first paragraph, presses End and types with keyboard presses (never a fill on the blank surface, which leaves no selection); she types two paragraphs: `Budget: the plan costs 10.` and `Hiring: we add two people.` (the fake model names topics from the text before the colon). Ana opens **Share**, copies the edit link; Bruno opens it and lands on the same document.
- Screenshots go to `.pr-media/scenario-core-realtime/<nn>-<test>-<author>.png`.

## Tests

### T1 Both authors see the same document after joining

- Expect: Bruno's editor text equals Ana's editor text; both see two paragraphs; both see the other's name among the members.

### T2 Ana's typing reaches Bruno

- Ana clicks the end of the Budget paragraph and types ` More money`.
- Expect: within 10 seconds Bruno's Budget paragraph ends with ` More money`; Ana's editor still has focus; no console error on either side.

### T3 Bruno's typing reaches Ana while Ana is typing too

- Ana types ` and tax` at the end of Budget while Bruno types ` A designer` at the end of Hiring, started within the same second.
- Expect: both editors converge to the same text; the Budget paragraph contains ` and tax` once and the Hiring paragraph contains ` A designer` once; no characters lost, none duplicated.

### T4 Every edit is attributed to its author on the timeline

- Ana clicks **Summarize edits** in the toolbar row and waits for the timeline bands `Budget` and `Hiring` (before the first summarize the bands carry the authors' names).
- Expect: the Budget band's contributors show Ana; the Hiring band's contributors show Bruno; the edit events endpoint (`/api/documents/<id>/events`) attributes ` More money and tax` to Ana's user id and ` A designer` to Bruno's.

### T5 A reload keeps everything

- Ana reloads the document page.
- Expect: the text is unchanged, the bands are still there, Bruno is still a member and Bruno's next keystroke reaches Ana within 10 seconds.

### T6 Offline edits merge on reconnect

- Bruno goes offline (`browser_run_code_unsafe`: `page.context().setOffline(true)`), types ` while offline` at the end of Hiring, then comes back online.
- Expect: Ana does not see ` while offline` while Bruno is offline; within 15 seconds of reconnecting both editors converge and the timeline attributes ` while offline` to Bruno.

### T7 A read-only link cannot edit but follows live

- Ana copies the read link. Bruno signs out on his server and signs in as Dani (`dani@example.com`, not a member); Dani opens the read link.
- Expect: Dani lands on the document as a reader, typing changes nothing; when Ana types ` for readers` Dani's page shows it within 10 seconds. Bruno signs back in afterwards and reopens the edit link.

### T8 Time travel shows the same past to both

- Version marks are one per minute: Ana opens, from the chart, the latest mark whose text still lacks ` while offline`, and copies the `?at=` link; Bruno opens it.
- Expect: both viewers show text without ` while offline`; the version banner shows the same sequence number for both; Escape returns each to the live editor with the current text.

### T9 Both authors delete and the document stays consistent

- Ana selects the whole Budget paragraph text and deletes it; at the same time Bruno deletes ` A designer`.
- Expect: both editors converge; the Budget paragraph is empty or gone on both; the events show Ana's deletion and Bruno's deletion with their lengths; the character accounting holds (`sum(inserted) - sum(deleted) == final length - initial length`).

### T10 Edge: a burst paste

- Bruno pastes 2,000 characters as one input event at the end of Hiring.
- Expect: Ana receives the full paste within 15 seconds; the timeline draws one new band or grows the Hiring band; no console error; the server health endpoint still answers 200 within 1 second.

## Edge cases to hunt during the run

- Ana types into a paragraph Bruno is deleting.
- Bruno's share link reopened after Ana sign-out.
- Narrow width (375) on Bruno's side while Ana edits.
- A second upload by Ana while Bruno still has the first document open.
