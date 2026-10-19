# Test plan: Version view after a delete

## The failing test first

- [ ] `<layer test>` — input: updates add, edit, delete a paragraph; version at the edit; expected: the edited text
- [ ] Confirmed it fails for the right reason: <paste>

## E2E

- [ ] `e2e/time-travel.spec.ts::the version of an edit shows the paragraph after it was deleted later` — five steps; expected: the version frame shows the edited paragraph
- [ ] Existing time-travel tests stay green

## Prove it for real — Playwright MCP

- [ ] The owner's five steps; expected: the edited paragraph in the version view; Back returns to the live document
- [ ] The add event's version shows the original text; the delete event's version shows a blank document

## Adversarial review

- [ ] Claim 1: the cause is the one written in the spec — attack: revert the fix, confirm the E2E goes red; result:
- [ ] Claim 2: versions older than the minute rule still resolve — attack: run the pruned-version tests; result:
- [ ] Claim 3: no other version renders blank — attack: open every version of the repro document; result:

## Coverage honesty

- Documents with hundreds of versions are not exercised.
