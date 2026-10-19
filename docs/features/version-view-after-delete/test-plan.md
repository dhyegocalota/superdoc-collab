# Test plan: Version view after a delete

## The failing test first

- [x] `libs/history/src/version-state.test.ts::the version of a bin that ends before a later delete in the same minute shows the edit` — input: updates add, edit, delete a paragraph, the delete one narrowest bin after the edit; version at the edit bin's last instant; expected: the edited text
- [x] Confirmed it fails for the right reason:

```
AssertionError: expected 'Plan' to be 'PlanAdded and edited' // Object.is equality
 ❯ src/version-state.test.ts:118:38
```

The E2E fails the same way on the local stack:

```
Expected substring: "Added line edited"
Received string:    "Budget: the plan costs 10.Hiring: we add two people."
  > 272 |   expect(serverText).toContain(`${ADDED_PARAGRAPH}${ADDED_EDIT}`);
```

## E2E

- [x] `e2e/time-travel.spec.ts::the version of an edit shows the paragraph after it was deleted later` — five steps, each in its own 10-second bin; expected: the version frame shows the edited paragraph
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
