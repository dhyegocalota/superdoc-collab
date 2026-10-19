# Test plan: Version view after a delete

## The failing test first

- [x] `libs/history/src/version-state.test.ts::the version at the sequence of an edit shows the edit after a later delete in the same minute` — input: updates add, edit, delete a paragraph two seconds apart; version at the edit's sequence; expected: the edited text
- [x] Confirmed it fails for the right reason:

Red commit aa563692 (the stub threw):

```
Error: versionAt is not implemented
```

and `version-marks.test.ts::a sequence the log knows resolves to itself…` plus `versions-routes.test.ts::a logged sequence that is not a mark resolves to itself` failed on the old minute rule. Red commit 7e8dacd5 for the edit row: `runs.test.ts::a run opens the version after its last inserting event…` and `time-travel.test.tsx::an edit row opens the version after that edit` (`Unable to find role="button" and name "View version after this edit"`).

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
