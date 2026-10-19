# The editor survives a rejected edit

**Status:** Shipped 2026-10-17
**Tier:** 🟡
**Owner approval:** approved 2026-10-17 ("fix os 5 achados", defect 1 of the first `/scenario core-realtime` walk)
**ADRs:** none
**Not changing:** SuperDoc; the fatal path for every other exception; the CRDT outcome (keystrokes aimed at a deleted paragraph are lost, as Yjs defines).

## Problem

When one author types into a paragraph another author has just deleted, SuperDoc rejects each keystroke and reports it through `onException` with `code: 'edit-rejected'` and the message "This edit couldn't be completed. Adjust the selection and try again." The editor treated every `onException` payload as fatal and showed "The editor stopped working. Reload the page to continue.", although the SuperDoc instance kept running: the other author's text still arrived and a click on it restored the caret. Reproduced with two authors: 60-odd rejections for one slowly typed sentence.

## Change

- `superdoc-exceptions.ts`: `SuperDocExceptionCode.EditRejected` and `isRecoverableException(payload)`, true only for that code; every other code, and a payload without a code, stays fatal.
- `SuperDocEditor`: a recoverable payload sets a status line with our own copy (`EDIT_REJECTED_MESSAGE`: click where you want to type and try again), cleared on the next pointer down in the editor; the fatal message is unchanged for the rest.

## Tests

- Unit `superdoc-exceptions.test.ts` (red first): rejected edit → recoverable; other code → fatal; no code → fatal.
- E2E `collaboration.spec.ts::an edit rejected under a concurrent delete does not stop the editor`: Ana types slowly at the start of her paragraph while Bruno selects all and deletes; no fatal message, the status line shows; Bruno types a new paragraph; Ana clicks it, the status clears, she types and both converge.
