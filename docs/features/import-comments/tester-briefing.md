# Tester briefing: Import comments from an uploaded DOCX

Written by the lead; the owner asked for the fastest path, so no separate developer or tester sub-agent ran.

## What changed

- `libs/history/src/imported-comments.ts` — maps `comments.list()` items to imported revisions of kind `commented`.
- `apps/server/src/history/projection-worker.ts` — the import lists comments next to tracked changes and commits both.
- `libs/history/src/timeline/runs.ts`, `apps/server/src/history/timeline-service.ts` — runs carry `commented` and never merge a comment with an edit.
- `apps/web/src/features/timeline/bin-edits.tsx` — a comment run shows the comment label and its text, not an insertion.
- `libs/history/src/seed-docx.ts` — the seed builder writes comments.

## How to run

The root README's Quick install, then upload a DOCX that holds comments by someone other than the uploader.

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `apps/server/src/history/projection-scheduler.test.ts::comments in an uploaded file are imported with their original author and date` | only the tracked change came back; the comment row was missing | the worker lists comments and commits them as `commented` events |
| `libs/history/src/imported-comments.test.ts` | the module did not exist | the mapper exists |
| `libs/history/src/timeline/runs.test.ts::a comment never merges with an edit run of the same author, block and bin` | runs had no `commented` field | the run key includes it |
| `apps/web/src/features/timeline/timeline-panel.test.tsx::an imported comment is labelled as a comment, not as inserted text` | the run rendered as `ins` | the comment renders as a labelled quote |
