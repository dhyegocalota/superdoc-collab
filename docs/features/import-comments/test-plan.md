# Test plan: Import comments from an uploaded DOCX

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: `.

## The failing test first

- [x] `libs/history/src/imported-comments.test.ts::maps a comment to an imported revision` — input: a listed comment by Dana Reviewer on block 00000002 at 2026-02-13T10:00:00Z; expected: one revision `comment:0`, kind `commented`, that author, that time, that block, the comment text as inserted — evidence: libs/history vitest 301/301 passed
- [x] Confirmed it fails for the right reason: the integration test with the worker reverted to HEAD failed with the `commented` Dana Reviewer row missing — evidence: vitest -t "comments in an uploaded" 1 failed

## Unit

- [x] `imported-comments.test.ts::a reply takes its parent's block` — input: a reply with no target and a parent on block 00000002; expected: blockId 00000002 — evidence: libs/history vitest 301/301 passed
- [x] `imported-comments.test.ts::skips tracked-change cards` — input: an item with `trackedChange: true`; expected: no revision — evidence: libs/history vitest 301/301 passed
- [x] `imported-comments.test.ts::a comment without an author throws` — input: no `creatorName`; expected: `IncompleteCommentError` naming the comment — evidence: libs/history vitest 301/301 passed
- [x] `libs/history/src/timeline/runs.test.ts::a comment never merges with an edit run of the same author, block and bin` — input: an insertion and a comment by one author on one block in one bin; expected: two runs, one with `commented: true` — evidence: libs/history vitest 301/301 passed
- [x] `apps/web/src/features/timeline/timeline-panel.test.tsx::an imported comment is labelled as a comment, not as inserted text` — input: a run with `commented: true`; expected: the comment label and text, no `ins` element — evidence: apps/web vitest 141/141 passed

## Integration

- [x] `apps/server/src/history/projection-scheduler.test.ts::comments in an uploaded file are imported with their original author and date` — input: a DOCX with one tracked change by Chris Crawford and one comment by Dana Reviewer; expected: two imported events, the comment with kind `commented`, author Dana Reviewer, time 2026-02-13T10:00:00Z — evidence: apps/server vitest 2 passed (with the rebuild test)

## Prove it for real — Playwright MCP

- [x] Happy path: upload a DOCX with a tracked change and a comment by two authors; expected: the timeline shows both authors, the comment's bin lists it as a comment with its text — evidence: scenario stack, Ana uploads a DOCX with a Chris Crawford insertion and a Dana Reviewer comment; the timeline JSON names both, the Feb 13 10:00–10:15 bin lists Dana Reviewer with "Comment Please cite a source" (scripted walk, `.pr-media/import-comments/bin-with-comment-1280.png`)
- [x] Console and network clean: zero console errors, zero failed requests — evidence: the walk recorded no console error, no failed request and no 4xx/5xx response
- [x] Screenshot at `.pr-media/import-comments/` — evidence: `bin-with-comment-1280.png`

## Edge cases found during execution

- [x] Opening an imported bin with `?at=` keeps the banner on "Loading this version…": an imported event has no logged sequence, so there is no version to load. Not introduced here (tracked-change bins behave the same); left for a separate fix.

## Adversarial review

Skipped on the owner's request (fastest path).

## Coverage honesty

- Comments in headers, footers and footnotes — not imported: their block ids are not in the main story the timeline reads.
- Comment volume counts toward the contributor's inserted words — accepted to make a commenter's band visible.
- Selection summaries read a comment's text as inserted text — the language model may describe a comment as an addition.
