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
- [ ] Existing time-travel tests stay green — BLOCKED: the E2E suites are the lead's gate

## Prove it for real — Playwright MCP

- [x] The owner's five steps; expected: the edited paragraph in the version view; Back returns to the live document — evidence: new document, "Keep this line", Enter, "Original paragraph", " now EDITED", Shift+Home and two Backspaces typed in one go (live text "Keep this line"); chart click opened the bin ("Version at 12:17:45 PM", only "Keep this line": the known bin gap); the second edit row's View version after this edit set `?at=1792412260000&sequence=1289` and the version frame showed "Keep this line\nOriginal paragraph now EDITED"; browser Back dropped `sequence` (live text), Forward restored it, Back to live cleared `at` and `sequence`; screenshots .pr-media/testing/version-view-after-delete-bin-1280.png, version-view-after-delete-edit-version-1280.png
- [x] The add event's version shows the original text; the delete event's version shows a blank document — evidence: second document with each step in its own 10 s bin: the add bin showed "Solo text", the delete bin showed a blank page (frame text " ") and its row was struck through "Solo text" with a button opening sequence 1386 blank; the third bin showed "Third"; screenshot .pr-media/testing/version-view-after-delete-delete-bin-1280.png

## Adversarial review

- [ ] Claim 1: the cause is the one written in the spec — attack: revert the fix, confirm the E2E goes red; result:
- [ ] Claim 2: versions older than the minute rule still resolve — attack: run the pruned-version tests; result:
- [x] Claim 3: no other version renders blank — attack: open every version of the repro document; result: — evidence: every version of the two walked documents rendered: the five bins and rows of the two documents showed their expected text; the only blank is the delete event, as designed

## Coverage honesty

- Documents with hundreds of versions are not exercised.

## Edge cases found during execution

- `?sequence=999999` with a valid `at` opens a version view clamped to the bin (frame "Keep this line"), no error: hypothesis 4 holds; screenshot .pr-media/testing/version-view-after-delete-unknown-sequence-1280.png
- A reader (read link, Bruno) opening the URL with `at` and `sequence` sees the same edited version, banner data-sequence 1289: hypothesis 3 holds
- Browser Back from an edit-row version returns to the bin view without `sequence` and Forward restores it
- Not exercised: more than sixteen edit rows in turn (hypothesis 5) and claims 1 and 2
